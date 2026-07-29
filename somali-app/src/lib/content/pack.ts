import type { SomaliDB } from '@/lib/db/db'
import { getDb } from '@/lib/db/db'
import { buildEntry, newId, validateImport } from '@/lib/db/repo'
import { CARD_MODES } from '@/lib/db/types'
import type { AudioAsset, Card, Entry, EntryImport } from '@/lib/db/types'
import { createCard } from '@/lib/srs/engine'
import { normalizeForSearch } from '@/lib/content/somali'

/**
 * Pack de départ : un fichier `public/starter/pack.json` accompagné de ses
 * audios, généré par `scripts/fetch-50languages.mjs` ou préparé à la main
 * (voir README). Servi par l'app elle-même : l'import se fait donc en même
 * origine, sans problème de CORS, et fonctionne hors ligne une fois le site
 * chargé.
 */

export interface PackEntry extends EntryImport {
  /** Chemin de l'audio relatif au dossier du pack, ex. `audio/so_42.mp3`. */
  audio?: string
  /** « voix de : … » attribué aux audios du pack. */
  voiceName?: string
}

export interface StarterPack {
  name: string
  /** Licence du contenu (ex. « domaine public », « CC BY-NC-ND 3.0 »). */
  license: string
  attribution: string
  entries: PackEntry[]
}

export interface PackImportResult {
  status: 'ok' | 'absent' | 'invalid'
  added: number
  skippedDuplicates: number
  rejected: number
  audioAttached: number
  audioFailed: number
  license?: string
  attribution?: string
  errors: string[]
}

const PACK_BASE = '/starter'

/** Le pack est-il présent sur ce déploiement ? */
export async function fetchPack(): Promise<StarterPack | null> {
  try {
    const res = await fetch(`${PACK_BASE}/pack.json`, { cache: 'no-store' })
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (
      typeof data !== 'object' ||
      data === null ||
      !Array.isArray((data as StarterPack).entries)
    ) {
      return null
    }
    return data as StarterPack
  } catch {
    return null
  }
}

/**
 * Importe le pack : entrées + audios, idempotent.
 * Une entrée déjà présente (même somali + même français) n'est pas dupliquée ;
 * si elle n'a pas encore d'audio et que le pack en fournit un, il est rattaché.
 */
export async function importStarterPack(
  db: SomaliDB = getDb(),
  pack?: StarterPack | null,
): Promise<PackImportResult> {
  const result: PackImportResult = {
    status: 'ok',
    added: 0,
    skippedDuplicates: 0,
    rejected: 0,
    audioAttached: 0,
    audioFailed: 0,
    errors: [],
  }

  const data = pack ?? (await fetchPack())
  if (!data) {
    result.status = 'absent'
    return result
  }
  result.license = data.license
  result.attribution = data.attribution

  const existing = await db.entries.toArray()
  const byKey = new Map(existing.map((e) => [`${e.somaliSearch}|${e.frenchSearch}`, e]))

  for (const [index, item] of data.entries.entries()) {
    const issues = validateImport(item, index)
    if (issues.some((i) => i.severity === 'error')) {
      result.rejected += 1
      result.errors.push(
        `entrée ${index + 1} : ${issues.map((i) => i.message).join(' ; ')}`,
      )
      continue
    }

    const key = `${normalizeForSearch(item.somali)}|${normalizeForSearch(item.french)}`
    let entry = byKey.get(key)
    let isNew = false

    if (!entry) {
      entry = buildEntry({
        somali: item.somali,
        french: item.french,
        theme: item.theme,
        source: item.source,
        level: item.level ?? 1,
        notes: item.notes,
        literal: item.literal,
        tags: item.tags ?? [],
        // Jamais « vérifié » d'office : un locuteur natif doit confirmer.
        verified: false,
      })
      isNew = true
    }

    // Audio : uniquement si l'entrée n'en a pas déjà.
    if (item.audio && entry.audioIds.length === 0) {
      const asset = await fetchPackAudio(item, entry.id)
      if (asset) {
        await db.audio.put(asset)
        entry = {
          ...entry,
          audioIds: [...entry.audioIds, asset.id],
          primaryAudioId: asset.id,
        }
        result.audioAttached += 1
      } else {
        result.audioFailed += 1
        result.errors.push(`audio introuvable : ${item.audio}`)
      }
    }

    if (isNew) {
      const cards: Card[] = CARD_MODES.map((mode) => createCard(entry!.id, mode))
      await db.transaction('rw', db.entries, db.cards, async () => {
        await db.entries.put(entry!)
        await db.cards.bulkPut(cards)
      })
      byKey.set(key, entry)
      result.added += 1
    } else {
      await db.entries.put(entry)
      result.skippedDuplicates += 1
    }
  }

  return result
}

async function fetchPackAudio(
  item: PackEntry,
  entryId: string,
): Promise<AudioAsset | null> {
  if (!item.audio) return null
  try {
    const res = await fetch(`${PACK_BASE}/${item.audio}`)
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.size === 0) return null
    const fileName = item.audio.split('/').pop() ?? `${entryId}.mp3`
    const asset: AudioAsset = {
      id: newId(),
      blob,
      mimeType: blob.type || 'audio/mpeg',
      bytes: blob.size,
      kind: 'imported',
      entryId,
      fileName,
      createdAt: Date.now(),
    }
    if (item.voiceName) asset.voiceName = item.voiceName
    return asset
  } catch {
    return null
  }
}
