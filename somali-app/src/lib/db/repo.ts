import { CARD_MODES, THEMES } from './types'
import type {
  Card,
  CardMode,
  DailyStat,
  Entry,
  EntryImport,
  Level,
  ReviewLogEntry,
  Settings,
  Theme,
} from './types'
import type { SomaliDB } from './db'
import { getDb } from './db'
import { createCard } from '@/lib/srs/engine'
import { defaultSettings } from '@/lib/srs/defaults'
import { detectPhonemes, invalidCharacters, normalizeForSearch } from '@/lib/content/somali'
import { dayKey } from '@/lib/date'

/* ------------------------------------------------------------------ */
/* Identifiants                                                        */
/* ------------------------------------------------------------------ */

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

/* ------------------------------------------------------------------ */
/* Réglages                                                            */
/* ------------------------------------------------------------------ */

export async function getSettings(db: SomaliDB = getDb()): Promise<Settings> {
  const stored = await db.settings.get('settings')
  if (stored) return { ...defaultSettings(), ...stored, fsrs: { ...defaultSettings().fsrs, ...stored.fsrs } }
  const fresh = defaultSettings()
  await db.settings.put(fresh)
  return fresh
}

export async function saveSettings(
  patch: Partial<Omit<Settings, 'key'>>,
  db: SomaliDB = getDb(),
): Promise<Settings> {
  const current = await getSettings(db)
  const next: Settings = {
    ...current,
    ...patch,
    fsrs: { ...current.fsrs, ...(patch.fsrs ?? {}) },
    key: 'settings',
    updatedAt: Date.now(),
  }
  await db.settings.put(next)
  return next
}

/* ------------------------------------------------------------------ */
/* Entrées                                                             */
/* ------------------------------------------------------------------ */

export interface NewEntryInput {
  somali: string
  french: string
  theme: Theme
  source: string
  level?: Level
  notes?: string
  literal?: string
  verified?: boolean
  tags?: string[]
  audioIds?: string[]
}

/** Construit une entrée complète (champs dérivés inclus) sans l'écrire. */
export function buildEntry(input: NewEntryInput, now = Date.now()): Entry {
  const somali = input.somali.trim()
  const french = input.french.trim()
  const entry: Entry = {
    id: newId(),
    somali,
    french,
    theme: input.theme,
    level: input.level ?? 1,
    source: input.source.trim(),
    // Rien n'est vérifié tant qu'un locuteur natif n'a pas confirmé.
    verified: input.verified === true,
    audioIds: input.audioIds ?? [],
    tags: input.tags ?? [],
    favorite: false,
    phonemes: detectPhonemes(somali),
    somaliSearch: normalizeForSearch(somali),
    frenchSearch: normalizeForSearch(french),
    createdAt: now,
    updatedAt: now,
  }
  if (input.notes) entry.notes = input.notes.trim()
  if (input.literal) entry.literal = input.literal.trim()
  return entry
}

/** Ajoute une entrée et crée ses trois cartes (une par mode). */
export async function addEntry(
  input: NewEntryInput,
  db: SomaliDB = getDb(),
): Promise<Entry> {
  const entry = buildEntry(input)
  const cards = CARD_MODES.map((mode) => createCard(entry.id, mode))
  await db.transaction('rw', db.entries, db.cards, async () => {
    await db.entries.put(entry)
    await db.cards.bulkPut(cards)
  })
  return entry
}

export async function updateEntry(
  id: string,
  patch: Partial<Entry>,
  db: SomaliDB = getDb(),
): Promise<Entry | undefined> {
  const current = await db.entries.get(id)
  if (!current) return undefined
  const next: Entry = { ...current, ...patch, id, updatedAt: Date.now() }
  if (patch.somali !== undefined) {
    next.somali = patch.somali.trim()
    next.somaliSearch = normalizeForSearch(next.somali)
    next.phonemes = detectPhonemes(next.somali)
  }
  if (patch.french !== undefined) {
    next.french = patch.french.trim()
    next.frenchSearch = normalizeForSearch(next.french)
  }
  await db.entries.put(next)
  return next
}

/** Marque une entrée comme vérifiée par un locuteur natif. */
export async function setVerified(
  id: string,
  verified: boolean,
  by?: string,
  db: SomaliDB = getDb(),
): Promise<Entry | undefined> {
  const patch: Partial<Entry> = { verified }
  if (verified) {
    patch.verifiedAt = Date.now()
    if (by) patch.verifiedBy = by
  } else {
    patch.verifiedAt = undefined
    patch.verifiedBy = undefined
  }
  return updateEntry(id, patch, db)
}

export async function toggleFavorite(
  id: string,
  db: SomaliDB = getDb(),
): Promise<Entry | undefined> {
  const entry = await db.entries.get(id)
  if (!entry) return undefined
  return updateEntry(id, { favorite: !entry.favorite }, db)
}

/** Supprime une entrée ainsi que ses cartes, son journal et ses audios. */
export async function deleteEntry(id: string, db: SomaliDB = getDb()): Promise<void> {
  await db.transaction('rw', db.entries, db.cards, db.reviewLogs, db.audio, async () => {
    await db.entries.delete(id)
    await db.cards.where('entryId').equals(id).delete()
    await db.reviewLogs.where('entryId').equals(id).delete()
    await db.audio.where('entryId').equals(id).delete()
  })
}

/**
 * Garantit qu'une entrée possède bien une carte par mode.
 * Utile après l'ajout d'un mode ou une migration.
 */
export async function ensureCards(
  entryId: string,
  db: SomaliDB = getDb(),
): Promise<Card[]> {
  const existing = await db.cards.where('entryId').equals(entryId).toArray()
  const have = new Set(existing.map((c) => c.mode))
  const missing = CARD_MODES.filter((m) => !have.has(m)).map((m) => createCard(entryId, m))
  if (missing.length > 0) await db.cards.bulkPut(missing)
  return [...existing, ...missing]
}

/* ------------------------------------------------------------------ */
/* Recherche                                                           */
/* ------------------------------------------------------------------ */

export interface SearchFilters {
  query?: string
  theme?: Theme | 'all'
  level?: Level | 'all'
  verified?: 'all' | 'yes' | 'no'
  favoritesOnly?: boolean
  withAudioOnly?: boolean
  voiceName?: string
}

/**
 * Recherche instantanée, somali et français confondus.
 * Le filtrage se fait en mémoire : la base personnelle reste petite et cela
 * évite la complexité d'un index plein texte dans IndexedDB.
 */
export function filterEntries(entries: Entry[], filters: SearchFilters): Entry[] {
  const q = filters.query ? normalizeForSearch(filters.query) : ''
  const terms = q ? q.split(' ').filter(Boolean) : []

  return entries.filter((e) => {
    if (filters.theme && filters.theme !== 'all' && e.theme !== filters.theme) return false
    if (filters.level && filters.level !== 'all' && e.level !== filters.level) return false
    if (filters.verified === 'yes' && !e.verified) return false
    if (filters.verified === 'no' && e.verified) return false
    if (filters.favoritesOnly && !e.favorite) return false
    if (filters.withAudioOnly && e.audioIds.length === 0) return false
    if (terms.length > 0) {
      const haystack = `${e.somaliSearch} ${e.frenchSearch} ${e.tags.join(' ')}`
      if (!terms.every((t) => haystack.includes(t))) return false
    }
    return true
  })
}

export async function searchEntries(
  filters: SearchFilters,
  db: SomaliDB = getDb(),
): Promise<Entry[]> {
  const all = await db.entries.toArray()
  return filterEntries(all, filters).sort((a, b) => a.somali.localeCompare(b.somali))
}

/* ------------------------------------------------------------------ */
/* Import en masse                                                     */
/* ------------------------------------------------------------------ */

export interface ImportIssue {
  index: number
  message: string
  /** `warning` n'empêche pas l'import ; `error` rejette la ligne. */
  severity: 'error' | 'warning'
}

export interface ImportReport {
  added: number
  skipped: number
  issues: ImportIssue[]
}

/** Vérifie une ligne d'import avant écriture. */
export function validateImport(raw: unknown, index: number): ImportIssue[] {
  const issues: ImportIssue[] = []
  const push = (message: string, severity: ImportIssue['severity'] = 'error'): void => {
    issues.push({ index, message, severity })
  }

  if (typeof raw !== 'object' || raw === null) {
    push('entrée illisible (objet attendu)')
    return issues
  }
  const item = raw as Partial<EntryImport>

  if (!item.somali || typeof item.somali !== 'string' || !item.somali.trim()) {
    push('champ « somali » manquant')
  }
  if (!item.french || typeof item.french !== 'string' || !item.french.trim()) {
    push('champ « french » manquant')
  }
  if (!item.source || typeof item.source !== 'string' || !item.source.trim()) {
    push('champ « source » manquant : toute phrase doit être traçable')
  }
  if (!item.theme || !(THEMES as readonly string[]).includes(item.theme)) {
    push(`thème inconnu « ${String(item.theme)} »`)
  }
  if (item.level !== undefined && ![1, 2, 3].includes(item.level)) {
    push(`niveau invalide « ${String(item.level)} » (1, 2 ou 3 attendu)`)
  }
  if (typeof item.somali === 'string') {
    const bad = invalidCharacters(item.somali)
    if (bad.length > 0) {
      push(
        `caractères hors alphabet somali : ${bad.join(', ')} — vérifier la transcription`,
        'warning',
      )
    }
  }
  if (item.verified === true) {
    push(
      'importée comme vérifiée : à ne faire que si un locuteur natif a confirmé',
      'warning',
    )
  }
  return issues
}

/**
 * Importe un lot d'entrées.
 * Les doublons (même somali + même français) sont ignorés silencieusement.
 */
export async function importEntries(
  items: unknown[],
  db: SomaliDB = getDb(),
): Promise<ImportReport> {
  const report: ImportReport = { added: 0, skipped: 0, issues: [] }
  const existing = await db.entries.toArray()
  const seen = new Set(existing.map((e) => `${e.somaliSearch}|${e.frenchSearch}`))

  const toAdd: Entry[] = []
  const cards: Card[] = []

  items.forEach((raw, index) => {
    const issues = validateImport(raw, index)
    report.issues.push(...issues)
    if (issues.some((i) => i.severity === 'error')) {
      report.skipped += 1
      return
    }
    const item = raw as EntryImport
    const key = `${normalizeForSearch(item.somali)}|${normalizeForSearch(item.french)}`
    if (seen.has(key)) {
      report.skipped += 1
      report.issues.push({ index, message: 'doublon ignoré', severity: 'warning' })
      return
    }
    seen.add(key)

    const entry = buildEntry({
      somali: item.somali,
      french: item.french,
      theme: item.theme,
      source: item.source,
      level: item.level ?? 1,
      notes: item.notes,
      literal: item.literal,
      verified: item.verified === true,
      tags: item.tags ?? [],
    })
    toAdd.push(entry)
    cards.push(...CARD_MODES.map((mode) => createCard(entry.id, mode)))
  })

  if (toAdd.length > 0) {
    await db.transaction('rw', db.entries, db.cards, async () => {
      await db.entries.bulkPut(toAdd)
      await db.cards.bulkPut(cards)
    })
    report.added = toAdd.length
  }
  return report
}

/* ------------------------------------------------------------------ */
/* Révisions                                                           */
/* ------------------------------------------------------------------ */

/**
 * Enregistre le résultat d'une révision : carte mise à jour, ligne de journal
 * et compteurs du jour, le tout dans une seule transaction.
 */
export async function recordReview(
  card: Card,
  log: ReviewLogEntry,
  wasNew: boolean,
  db: SomaliDB = getDb(),
): Promise<void> {
  const key = dayKey(log.review)
  await db.transaction('rw', db.cards, db.reviewLogs, db.dailyStats, async () => {
    await db.cards.put(card)
    await db.reviewLogs.add(log)
    const stat = (await db.dailyStats.get(key)) ?? emptyDailyStat(key)
    stat.reviews += 1
    if (wasNew) stat.newCards += 1
    if (log.rating === 1) stat.again += 1
    else stat.correct += 1
    stat.studyMs += log.durationMs ?? 0
    await db.dailyStats.put(stat)
  })
}

export function emptyDailyStat(date: string): DailyStat {
  return {
    date,
    reviews: 0,
    newCards: 0,
    again: 0,
    correct: 0,
    listeningMs: 0,
    studyMs: 0,
  }
}

/** Ajoute du temps d'écoute au compteur du jour (répertoire, mode boucle). */
export async function addListeningTime(
  ms: number,
  db: SomaliDB = getDb(),
  now = new Date(),
): Promise<void> {
  const key = dayKey(now)
  await db.transaction('rw', db.dailyStats, async () => {
    const stat = (await db.dailyStats.get(key)) ?? emptyDailyStat(key)
    stat.listeningMs += ms
    await db.dailyStats.put(stat)
  })
}

export async function todayStat(
  db: SomaliDB = getDb(),
  now = new Date(),
): Promise<DailyStat> {
  return (await db.dailyStats.get(dayKey(now))) ?? emptyDailyStat(dayKey(now))
}

/* ------------------------------------------------------------------ */
/* Rétro-calcul global                                                 */
/* ------------------------------------------------------------------ */

/** Journal d'une carte, trié chronologiquement. */
export async function historyFor(
  cardId: string,
  db: SomaliDB = getDb(),
): Promise<ReviewLogEntry[]> {
  const logs = await db.reviewLogs.where('cardId').equals(cardId).toArray()
  return logs.sort((a, b) => a.review.getTime() - b.review.getTime())
}

/* ------------------------------------------------------------------ */
/* Compteurs                                                           */
/* ------------------------------------------------------------------ */

export interface Overview {
  entries: number
  unverified: number
  dueNow: number
  newAvailable: number
  cards: number
}

export async function overview(
  db: SomaliDB = getDb(),
  now = new Date(),
): Promise<Overview> {
  const [entries, cards] = await Promise.all([db.entries.toArray(), db.cards.toArray()])
  return {
    entries: entries.length,
    unverified: entries.filter((e) => !e.verified).length,
    cards: cards.length,
    dueNow: cards.filter(
      (c) => !c.suspended && c.state !== 0 && c.due.getTime() <= now.getTime(),
    ).length,
    newAvailable: cards.filter((c) => !c.suspended && c.state === 0).length,
  }
}

export const ALL_MODES: readonly CardMode[] = CARD_MODES
