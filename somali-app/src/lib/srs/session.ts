import type { SomaliDB } from '@/lib/db/db'
import { getDb } from '@/lib/db/db'
import { getSettings, todayStat } from '@/lib/db/repo'
import type { Card, Entry, Settings } from '@/lib/db/types'
import { buildQueue, type QueueCounts } from './queue'

export interface SessionData {
  queue: Card[]
  entries: Map<string, Entry>
  counts: QueueCounts
  settings: Settings
}

/**
 * Prépare une session de révision : lit les réglages, les compteurs du jour,
 * puis construit la file.
 *
 * Particularité : une carte « écoute pure » n'a de sens que si sa phrase a de
 * l'audio. Les cartes d'écoute des entrées muettes sont écartées — elles
 * réapparaîtront d'elles-mêmes dès qu'un enregistrement sera rattaché.
 */
export async function loadSession(
  db: SomaliDB = getDb(),
  now = new Date(),
): Promise<SessionData> {
  const settings = await getSettings(db)
  const [cards, entryList, stat] = await Promise.all([
    db.cards.toArray(),
    db.entries.toArray(),
    todayStat(db, now),
  ])

  const entries = new Map(entryList.map((e) => [e.id, e]))
  const eligible = cards.filter((c) => {
    const entry = entries.get(c.entryId)
    if (!entry) return false // carte orpheline (entrée supprimée)
    if (c.mode === 'listening' && entry.audioIds.length === 0) return false
    return true
  })

  const { queue, counts } = buildQueue(eligible, {
    now,
    newCardsPerDay: settings.newCardsPerDay,
    newIntroducedToday: stat.newCards,
    maxReviewsPerDay: settings.maxReviewsPerDay,
    reviewsDoneToday: stat.reviews,
    enabledModes: settings.enabledModes,
  })

  return { queue, entries, counts, settings }
}

/**
 * Une carte notée « À revoir » (ou en palier court) redevient échue pendant la
 * session : on la remet en fin de file plutôt que d'attendre demain.
 */
export function shouldRequeue(card: Card, now: Date, horizonMs = 15 * 60_000): boolean {
  return card.due.getTime() <= now.getTime() + horizonMs
}
