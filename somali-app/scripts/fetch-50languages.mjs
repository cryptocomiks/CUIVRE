#!/usr/bin/env node
/**
 * Récupère un pack de départ français → somali depuis 50languages.com (book2,
 * Goethe-Verlag) : paires de phrases + audio MP3 par phrase.
 *
 * ⚠ Licence du contenu 50languages : CC BY-NC-ND 3.0
 *   (https://www.50languages.com/licence.php). Usage personnel et partage non
 *   commercial avec attribution uniquement. Le dossier de sortie est ignoré
 *   par git : ne le committez pas dans un dépôt public sans avoir vérifié la
 *   licence vous-même.
 *
 * Ce script s'exécute sur une machine à l'internet ouvert (votre VPS ou votre
 * ordinateur), PAS dans un déploiement :
 *
 *   node scripts/fetch-50languages.mjs --probe        # le somali existe-t-il ?
 *   node scripts/fetch-50languages.mjs                # pack par défaut (~30 phrases)
 *   node scripts/fetch-50languages.mjs --lessons 2,3,7 --per-lesson 8
 *
 * Sortie : public/starter/pack.json + public/starter/audio/*.mp3, que
 * l'application importe ensuite via « Charger le pack de départ ».
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const LESSON_URL = (src, lessonId, dest) =>
  `https://www.50languages.com/${src}/learn/phrasebook-lessons/${lessonId}/${dest}`
// Les leçons 1-100 sont numérotées 162-261 dans les URL depuis février 2023.
const LESSON_OFFSET = 161
const SOUND_URL = (dest, soundId) =>
  `https://www.book2.nl/book2/${dest.toUpperCase()}/SOUND/${soundId}.mp3`

const SRC = 'fr'
/** Codes candidats pour le somali chez 50languages/book2. */
const DEST_CANDIDATES = ['so', 'som', 'sm']

/** Thème de l'app pour chaque leçon book2 utilisée par défaut. */
const LESSON_THEMES = {
  2: 'famille', // La famille
  3: 'salutations', // Faire connaissance
  7: 'chiffres', // Les nombres
  8: 'temps', // L'heure
  9: 'temps', // Les jours de la semaine
  12: 'nourriture', // Les boissons
  15: 'nourriture', // Fruits et aliments
  20: 'expressions', // Conversation 1
  21: 'expressions', // Conversation 2
  25: 'deplacements', // En ville
  29: 'nourriture', // Au restaurant 1
  41: 'deplacements', // Demander le chemin
  57: 'sante', // Chez le médecin
  63: 'questions', // Poser des questions 1
}

const DEFAULT_LESSONS = [3, 2, 7, 12, 20]
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const args = parseArgs(process.argv.slice(2))
const OUT_DIR = path.resolve(args.out ?? 'public/starter')
const PER_LESSON = Number(args['per-lesson'] ?? 6)
const MAX_TOTAL = Number(args.max ?? 30)
const LESSONS = args.lessons
  ? String(args.lessons).split(',').map((n) => Number(n.trim())).filter(Boolean)
  : DEFAULT_LESSONS

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) out[key] = true
    else {
      out[key] = next
      i++
    }
  }
  return out
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, type = 'text') {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'fr,en;q=0.8' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`)
  return type === 'text' ? res.text() : Buffer.from(await res.arrayBuffer())
}

/* ------------------------------------------------------------------ */
/* Analyse HTML — tolérante aux deux structures connues du site        */
/* ------------------------------------------------------------------ */

export function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extrait les lignes (fr, so, soundId) d'une page de leçon.
 *
 * Deux mises en page ont existé (cf. scrapers publics triton11/… 2024 et
 * abdnh/50langs2anki 2023) ; on tente les deux, puis un repli générique :
 * toute rangée <tr> contenant un attribut offset_text (l'identifiant audio).
 */
export function parseLesson(html) {
  const rows = []
  const trs = html.split(/<tr[\s>]/i).slice(1)
  for (const chunk of trs) {
    const tr = chunk.slice(0, chunk.search(/<\/tr>/i) >= 0 ? chunk.search(/<\/tr>/i) : chunk.length)

    const soundMatch =
      tr.match(/offset_text\s*=\s*"(\d+)"/i) ??
      tr.match(/\/SOUND\/(\d+)\.mp3/i)
    if (!soundMatch) continue
    const soundId = soundMatch[1]

    // Découpe en conservant la fin de balise ouvrante, avec ou sans attributs.
    const tds = tr
      .split(/<td\b/i)
      .slice(1)
      .map((td) => ({
        attrs: td.slice(0, Math.max(0, td.indexOf('>'))),
        inner: td.slice(td.indexOf('>') + 1),
      }))
    if (tds.length < 2) continue

    // Variante 2024 : classes explicites.
    let src = null
    let dest = null
    for (const td of tds) {
      if (/nativee_txtt/.test(td.attrs)) src = stripTags(td.inner)
      if (/target-phrase/.test(td.attrs)) {
        const spans = [...td.inner.matchAll(/<span[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi)]
        const plain = spans.find(
          (m) => /default_phrase/.test(m[1]) && !/transliteration/.test(m[1]),
        )
        if (plain) dest = stripTags(plain[2])
      }
    }

    // Variante 2023 : td[0] = langue source, td[1] = langue cible (spans).
    if (!src) src = stripTags(tds[0].inner)
    if (!dest) {
      const spans = [...tds[1].inner.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((m) =>
        stripTags(m[1]),
      )
      dest = spans.filter(Boolean).at(-1) ?? stripTags(tds[1].inner)
    }

    if (src && dest && src !== dest) rows.push({ fr: src, so: dest, soundId })
  }
  return rows
}

export function parseLessonTitle(html) {
  const m =
    html.match(/<title>([^<]+)<\/title>/i) ??
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  return m ? stripTags(m[1]).slice(0, 80) : ''
}

/* ------------------------------------------------------------------ */

async function probe() {
  for (const dest of DEST_CANDIDATES) {
    const url = LESSON_URL(SRC, 1 + LESSON_OFFSET, dest)
    try {
      const html = await get(url)
      const rows = parseLesson(html)
      if (rows.length > 3) {
        console.log(`✔ Somali disponible : code « ${dest} » (${rows.length} lignes sur la leçon 1)`)
        console.log(`  ${url}`)
        return dest
      }
      console.log(`✘ ${url} répond mais sans table exploitable (${rows.length} lignes)`)
      if (args.debug) {
        const dump = path.join(OUT_DIR, `debug-${dest}.html`)
        await mkdir(OUT_DIR, { recursive: true })
        await writeFile(dump, html)
        console.log(`  page brute sauvée dans ${dump}`)
      }
    } catch (e) {
      console.log(`✘ code « ${dest } » : ${e.message}`)
    }
    await sleep(1200)
  }
  return null
}

async function main() {
  console.log('Sondage de la disponibilité du somali chez 50languages…')
  const dest = await probe()
  if (!dest) {
    console.error(`
Le somali ne semble pas disponible chez 50languages (ou le site a changé /
bloque les requêtes). Solutions de repli, détaillées dans le README :
  1. Kit de survie linguistique somali du DLI (domaine public) — téléchargez le
     ZIP audio, puis importez les MP3 dans l'application.
  2. Relancez avec --debug pour sauvegarder les pages brutes et inspectez-les.`)
    process.exit(2)
  }
  if (args.probe) return

  await mkdir(path.join(OUT_DIR, 'audio'), { recursive: true })
  const entries = []

  for (const lesson of LESSONS) {
    if (entries.length >= MAX_TOTAL) break
    const url = LESSON_URL(SRC, lesson + LESSON_OFFSET, dest)
    console.log(`Leçon ${lesson} : ${url}`)
    let html
    try {
      html = await get(url)
    } catch (e) {
      console.error(`  échec : ${e.message}`)
      continue
    }
    const title = parseLessonTitle(html)
    const rows = parseLesson(html)
    console.log(`  ${rows.length} phrases trouvées — « ${title} »`)

    let taken = 0
    for (const row of rows) {
      if (taken >= PER_LESSON || entries.length >= MAX_TOTAL) break
      const audioName = `audio/${dest}_${row.soundId}.mp3`
      try {
        const mp3 = await get(SOUND_URL(dest, row.soundId), 'buffer')
        if (mp3.length < 1000) throw new Error('fichier vide')
        await writeFile(path.join(OUT_DIR, audioName), mp3)
      } catch (e) {
        console.error(`  audio ${row.soundId} : ${e.message} — phrase ignorée`)
        continue
      }
      entries.push({
        somali: row.so,
        french: row.fr,
        theme: LESSON_THEMES[lesson] ?? 'expressions',
        level: 1,
        source: `50languages.com, leçon ${lesson} (« ${title} »), Goethe-Verlag — CC BY-NC-ND 3.0`,
        tags: [`50languages-l${lesson}`],
        audio: audioName,
        voiceName: '50languages',
      })
      taken++
      await sleep(800)
    }
    await sleep(1500)
  }

  if (entries.length === 0) {
    console.error('Aucune phrase récupérée — rien écrit.')
    process.exit(2)
  }

  const pack = {
    name: `Pack de départ 50languages (fr → ${dest})`,
    license: 'CC BY-NC-ND 3.0 — https://www.50languages.com/licence.php',
    attribution: '50languages.com / book2, © Goethe-Verlag GmbH',
    entries,
  }
  await writeFile(path.join(OUT_DIR, 'pack.json'), JSON.stringify(pack, null, 2))
  console.log(`
✔ Pack écrit : ${path.join(OUT_DIR, 'pack.json')} (${entries.length} phrases, audio inclus)
Étapes suivantes :
  1. npm run build && npm start   (ou npm run dev)
  2. Dans l'application : Réglages → « Charger le pack de départ ».
Rappel licence : contenu CC BY-NC-ND 3.0, usage personnel / partage non
commercial avec attribution. Dossier exclu de git par défaut.`)
}

// N'exécute main() que lorsqu'on lance le script directement (pas à l'import).
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
