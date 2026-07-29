import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SomaliDB } from './db'
import {
  addEntry,
  deleteEntry,
  ensureCards,
  filterEntries,
  getSettings,
  historyFor,
  importEntries,
  overview,
  recordReview,
  saveSettings,
  searchEntries,
  setVerified,
  todayStat,
  toggleFavorite,
  validateImport,
} from './repo'
import { buildScheduler, createCard, rateCard, Rating } from '@/lib/srs/engine'
import { defaultSettings } from '@/lib/srs/defaults'
import type { EntryImport } from './types'

let db: SomaliDB
let counter = 0

beforeEach(async () => {
  counter += 1
  db = new SomaliDB(`test-db-${counter}`)
  await db.open()
})

const sample = {
  somali: 'Subax wanaagsan',
  french: 'Bonjour (le matin)',
  theme: 'salutations' as const,
  source: 'Test — non vérifié',
}

describe('réglages', () => {
  it('crée les réglages par défaut au premier accès', async () => {
    const settings = await getSettings(db)
    expect(settings.newCardsPerDay).toBe(10)
    expect(settings.ttsProvider).toBe('none')
    expect(settings.enabledModes).toEqual(['recognition', 'production', 'listening'])
  })

  it('fusionne les modifications partielles sans perdre les autres champs', async () => {
    await getSettings(db)
    const updated = await saveSettings({ newCardsPerDay: 25 }, db)
    expect(updated.newCardsPerDay).toBe(25)
    expect(updated.fsrs.requestRetention).toBe(0.9)

    const withFsrs = await saveSettings({ fsrs: { ...updated.fsrs, requestRetention: 0.85 } }, db)
    expect(withFsrs.newCardsPerDay).toBe(25)
    expect(withFsrs.fsrs.requestRetention).toBe(0.85)
  })
})

describe('entrées', () => {
  it('crée trois cartes, une par mode', async () => {
    const entry = await addEntry(sample, db)
    const cards = await db.cards.where('entryId').equals(entry.id).toArray()
    expect(cards.map((c) => c.mode).sort()).toEqual([
      'listening',
      'production',
      'recognition',
    ])
  })

  it('marque toute nouvelle entrée comme non vérifiée par défaut', async () => {
    const entry = await addEntry(sample, db)
    expect(entry.verified).toBe(false)
    expect(entry.verifiedAt).toBeUndefined()
  })

  it('calcule les champs dérivés (recherche, phonèmes)', async () => {
    const entry = await addEntry(
      { ...sample, somali: 'Waxaan doonayaa qaxwo', french: 'Je voudrais du café' },
      db,
    )
    expect(entry.somaliSearch).toBe('waxaan doonayaa qaxwo')
    expect(entry.frenchSearch).toBe('je voudrais du cafe')
    expect(entry.phonemes).toContain('q')
    expect(entry.phonemes).toContain('x')
    expect(entry.phonemes).toContain('long-vowel')
  })

  it('valide une entrée et horodate la validation', async () => {
    const entry = await addEntry(sample, db)
    const verified = await setVerified(entry.id, true, 'Amina', db)
    expect(verified?.verified).toBe(true)
    expect(verified?.verifiedBy).toBe('Amina')
    expect(verified?.verifiedAt).toBeTypeOf('number')

    const reverted = await setVerified(entry.id, false, undefined, db)
    expect(reverted?.verified).toBe(false)
    expect(reverted?.verifiedAt).toBeUndefined()
  })

  it('bascule le statut favori', async () => {
    const entry = await addEntry(sample, db)
    expect((await toggleFavorite(entry.id, db))?.favorite).toBe(true)
    expect((await toggleFavorite(entry.id, db))?.favorite).toBe(false)
  })

  it('supprime en cascade cartes, journal et audio', async () => {
    const entry = await addEntry(sample, db)
    await db.audio.put({
      id: 'a1',
      blob: new Blob(['x']),
      mimeType: 'audio/mpeg',
      bytes: 1,
      kind: 'imported',
      entryId: entry.id,
      fileName: 'a1.mp3',
      createdAt: Date.now(),
    })
    const card = createCard(entry.id, 'listening')
    const { log } = rateCard(buildScheduler(defaultSettings().fsrs), card, Rating.Good)
    await db.reviewLogs.add(log)

    await deleteEntry(entry.id, db)
    expect(await db.entries.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
    expect(await db.reviewLogs.count()).toBe(0)
    expect(await db.audio.count()).toBe(0)
  })

  it('recrée uniquement les cartes manquantes', async () => {
    const entry = await addEntry(sample, db)
    await db.cards.delete(`${entry.id}:listening`)
    const cards = await ensureCards(entry.id, db)
    expect(cards).toHaveLength(3)
    expect(await db.cards.where('entryId').equals(entry.id).count()).toBe(3)
  })
})

describe('recherche', () => {
  const entries = [
    {
      ...sample,
      somali: 'Subax wanaagsan',
      french: 'Bonjour (le matin)',
      theme: 'salutations' as const,
    },
    {
      ...sample,
      somali: 'Waan ku faraxsanahay',
      french: 'Je suis content',
      theme: 'expressions' as const,
      level: 2 as const,
    },
    {
      ...sample,
      somali: 'Immisa ayay qiimahoodu yahay?',
      french: 'Combien ça coûte ?',
      theme: 'marche' as const,
    },
  ]

  beforeEach(async () => {
    for (const e of entries) await addEntry(e, db)
  })

  it('trouve par le somali', async () => {
    const found = await searchEntries({ query: 'subax' }, db)
    expect(found.map((e) => e.french)).toEqual(['Bonjour (le matin)'])
  })

  it('trouve par le français, sans tenir compte des accents', async () => {
    const found = await searchEntries({ query: 'coute' }, db)
    expect(found).toHaveLength(1)
    expect(found[0]?.theme).toBe('marche')
  })

  it('filtre par thème et par niveau', async () => {
    expect(await searchEntries({ theme: 'marche' }, db)).toHaveLength(1)
    expect(await searchEntries({ level: 2 }, db)).toHaveLength(1)
    expect(await searchEntries({ theme: 'all', level: 'all' }, db)).toHaveLength(3)
  })

  it('filtre sur le statut de vérification', async () => {
    const all = await searchEntries({}, db)
    await setVerified(all[0]!.id, true, 'Amina', db)
    expect(await searchEntries({ verified: 'yes' }, db)).toHaveLength(1)
    expect(await searchEntries({ verified: 'no' }, db)).toHaveLength(2)
  })

  it('exige que tous les termes correspondent', async () => {
    const all = await db.entries.toArray()
    expect(filterEntries(all, { query: 'je content' })).toHaveLength(1)
    expect(filterEntries(all, { query: 'je bonjour' })).toHaveLength(0)
  })
})

describe('import en masse', () => {
  const ok: EntryImport = {
    somali: 'Waa maxay magacaagu?',
    french: 'Comment tu t’appelles ?',
    theme: 'questions',
    source: 'Ressource X, p. 12',
  }

  it('importe les lignes valides', async () => {
    const report = await importEntries([ok], db)
    expect(report.added).toBe(1)
    expect(report.skipped).toBe(0)
    expect(await db.cards.count()).toBe(3)
  })

  it('force verified à false par défaut', async () => {
    await importEntries([ok], db)
    const entry = (await db.entries.toArray())[0]
    expect(entry?.verified).toBe(false)
  })

  it('rejette une ligne sans source', async () => {
    const report = await importEntries([{ ...ok, source: '' }], db)
    expect(report.added).toBe(0)
    expect(report.skipped).toBe(1)
    expect(report.issues.some((i) => i.message.includes('source'))).toBe(true)
  })

  it('rejette un thème inconnu', async () => {
    const report = await importEntries([{ ...ok, theme: 'cuisine' }], db)
    expect(report.added).toBe(0)
    expect(report.issues[0]?.message).toContain('thème inconnu')
  })

  it('signale les caractères hors alphabet somali sans bloquer', async () => {
    const report = await importEntries([{ ...ok, somali: 'Waa pizza' }], db)
    expect(report.added).toBe(1)
    const warning = report.issues.find((i) => i.severity === 'warning')
    expect(warning?.message).toContain('p')
  })

  it('avertit quand une ligne se déclare déjà vérifiée', async () => {
    const report = await importEntries([{ ...ok, verified: true }], db)
    expect(report.added).toBe(1)
    expect(report.issues.some((i) => i.message.includes('locuteur natif'))).toBe(true)
  })

  it('ignore les doublons, y compris entre deux imports', async () => {
    await importEntries([ok], db)
    const second = await importEntries([ok, { ...ok, somali: 'Xaggee tagaysaa?' }], db)
    expect(second.added).toBe(1)
    expect(second.skipped).toBe(1)
    expect(await db.entries.count()).toBe(2)
  })

  it('n’écrit rien quand toutes les lignes sont invalides', async () => {
    const report = await importEntries([{}, null, 'texte'], db)
    expect(report.added).toBe(0)
    expect(report.skipped).toBe(3)
    expect(await db.entries.count()).toBe(0)
  })

  it('accumule plusieurs erreurs sur une même ligne', () => {
    const issues = validateImport({ theme: 'inconnu' }, 3)
    expect(issues.every((i) => i.index === 3)).toBe(true)
    expect(issues.filter((i) => i.severity === 'error').length).toBeGreaterThanOrEqual(4)
  })
})

describe('enregistrement des révisions', () => {
  it('met à jour la carte, le journal et les compteurs du jour', async () => {
    const entry = await addEntry(sample, db)
    const scheduler = buildScheduler(defaultSettings().fsrs)
    const card = (await db.cards.get(`${entry.id}:recognition`))!
    const { card: next, log } = rateCard(scheduler, card, Rating.Good, new Date(), 3000)

    await recordReview(next, log, true, db)

    const stored = await db.cards.get(card.id)
    expect(stored?.reps).toBe(1)
    expect(await db.reviewLogs.count()).toBe(1)

    const stat = await todayStat(db)
    expect(stat.reviews).toBe(1)
    expect(stat.newCards).toBe(1)
    expect(stat.correct).toBe(1)
    expect(stat.again).toBe(0)
    expect(stat.studyMs).toBe(3000)
  })

  it('compte les oublis séparément', async () => {
    const entry = await addEntry(sample, db)
    const scheduler = buildScheduler(defaultSettings().fsrs)
    const card = (await db.cards.get(`${entry.id}:listening`))!
    const { card: next, log } = rateCard(scheduler, card, Rating.Again)
    await recordReview(next, log, true, db)

    const stat = await todayStat(db)
    expect(stat.again).toBe(1)
    expect(stat.correct).toBe(0)
  })

  it('restitue l’historique d’une carte dans l’ordre chronologique', async () => {
    const entry = await addEntry(sample, db)
    const scheduler = buildScheduler(defaultSettings().fsrs)
    let card = (await db.cards.get(`${entry.id}:production`))!
    let now = new Date('2026-02-01T10:00:00Z')
    for (let i = 0; i < 3; i++) {
      const res = rateCard(scheduler, card, Rating.Good, now)
      await recordReview(res.card, res.log, i === 0, db)
      card = res.card
      now = new Date(card.due.getTime())
    }
    const history = await historyFor(card.id, db)
    expect(history).toHaveLength(3)
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.review.getTime()).toBeGreaterThanOrEqual(
        history[i - 1]!.review.getTime(),
      )
    }
  })
})

describe('vue d’ensemble', () => {
  it('compte les entrées non vérifiées et les cartes disponibles', async () => {
    const a = await addEntry(sample, db)
    await addEntry({ ...sample, somali: 'Nabad', french: 'Paix / salut' }, db)
    await setVerified(a.id, true, 'Amina', db)

    const stats = await overview(db)
    expect(stats.entries).toBe(2)
    expect(stats.unverified).toBe(1)
    expect(stats.cards).toBe(6)
    expect(stats.newAvailable).toBe(6)
    expect(stats.dueNow).toBe(0)
  })
})
