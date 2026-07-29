import { State } from 'ts-fsrs'
import type { Card, CardMode } from '@/lib/db/types'

/**
 * Construction de la file de révision.
 *
 * Entièrement déterministe (aucun aléa) : la même entrée produit toujours la
 * même file, ce qui la rend testable et prévisible en session.
 */

export interface QueueOptions {
  now: Date
  /** Plafond de nouvelles cartes par jour. */
  newCardsPerDay: number
  /** Nouvelles cartes déjà introduites aujourd'hui. */
  newIntroducedToday: number
  /** Plafond de révisions par jour ; 0 = illimité. */
  maxReviewsPerDay: number
  reviewsDoneToday: number
  /** Modes actifs ; les cartes des autres modes sont ignorées. */
  enabledModes: CardMode[]
  /** Limite éventuelle de la session en cours. */
  sessionLimit?: number
}

export interface QueueCounts {
  new: number
  learning: number
  review: number
  total: number
}

export interface QueueResult {
  queue: Card[]
  counts: QueueCounts
}

const isLearning = (c: Card): boolean =>
  c.state === State.Learning || c.state === State.Relearning

const isNew = (c: Card): boolean => c.state === State.New

/** Cartes échues à l'instant `now`, hors nouvelles et hors suspendues. */
export function dueCards(cards: Card[], now: Date): Card[] {
  return cards.filter((c) => !c.suspended && !isNew(c) && c.due.getTime() <= now.getTime())
}

export function buildQueue(cards: Card[], opts: QueueOptions): QueueResult {
  const modes = new Set(opts.enabledModes)
  const eligible = cards.filter((c) => !c.suspended && modes.has(c.mode))

  const byDue = (a: Card, b: Card): number => a.due.getTime() - b.due.getTime()
  const nowMs = opts.now.getTime()

  const learning = eligible
    .filter((c) => isLearning(c) && c.due.getTime() <= nowMs)
    .sort(byDue)
  const review = eligible
    .filter((c) => c.state === State.Review && c.due.getTime() <= nowMs)
    .sort(byDue)

  // Les plus anciennes d'abord : une carte créée depuis longtemps et jamais
  // vue passe avant une carte importée hier.
  const fresh = eligible
    .filter(isNew)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))

  const newAllowance = Math.max(0, opts.newCardsPerDay - opts.newIntroducedToday)
  const selectedNew = fresh.slice(0, newAllowance)

  let due = [...learning, ...review]
  if (opts.maxReviewsPerDay > 0) {
    const remaining = Math.max(0, opts.maxReviewsPerDay - opts.reviewsDoneToday)
    due = due.slice(0, remaining)
  }

  let queue = interleaveNew(due, selectedNew)
  queue = spaceSameEntry(queue)
  if (opts.sessionLimit && opts.sessionLimit > 0) {
    queue = queue.slice(0, opts.sessionLimit)
  }

  const counts: QueueCounts = {
    new: queue.filter(isNew).length,
    learning: queue.filter(isLearning).length,
    review: queue.filter((c) => c.state === State.Review).length,
    total: queue.length,
  }
  return { queue, counts }
}

/**
 * Répartit les nouvelles cartes uniformément parmi les révisions, plutôt que
 * de les grouper en tête ou en queue de session.
 */
function interleaveNew(due: Card[], fresh: Card[]): Card[] {
  if (fresh.length === 0) return due
  if (due.length === 0) return fresh

  const out: Card[] = []
  const step = due.length / fresh.length
  let nextNew = 0
  for (let i = 0; i < due.length; i++) {
    while (nextNew < fresh.length && nextNew * step <= i) {
      out.push(fresh[nextNew] as Card)
      nextNew += 1
    }
    out.push(due[i] as Card)
  }
  while (nextNew < fresh.length) {
    out.push(fresh[nextNew] as Card)
    nextNew += 1
  }
  return out
}

/**
 * Évite deux cartes consécutives issues de la même phrase.
 *
 * Enchaîner « reconnaissance » puis « écoute » de la même phrase revient à se
 * tester sur une réponse qu'on vient de lire.
 *
 * Stratégie : à chaque étape, on prend la phrase qui a le plus de cartes
 * restantes parmi celles qui ne sont pas la précédente. Ce choix glouton
 * garantit un entrelacement sans collision dès qu'il en existe un, là où
 * « prendre la première différente » laisse les dernières phrases groupées.
 * À égalité, la carte la plus prioritaire (position d'origine la plus basse)
 * l'emporte : l'ordre par échéance est préservé quand une seule carte par
 * phrase est en jeu.
 */
function spaceSameEntry(queue: Card[]): Card[] {
  if (queue.length < 3) return queue

  const groups = new Map<string, Card[]>()
  for (const card of queue) {
    const bucket = groups.get(card.entryId)
    if (bucket) bucket.push(card)
    else groups.set(card.entryId, [card])
  }

  const rank = new Map<string, number>()
  queue.forEach((card, i) => {
    if (!rank.has(card.id)) rank.set(card.id, i)
  })

  const out: Card[] = []
  let lastEntry: string | null = null

  while (out.length < queue.length) {
    let best: { entryId: string; cards: Card[] } | null = null
    let fallback: { entryId: string; cards: Card[] } | null = null

    for (const [entryId, cards] of groups) {
      if (cards.length === 0) continue
      const candidate = { entryId, cards }
      if (entryId === lastEntry) {
        fallback = candidate
        continue
      }
      if (best === null || betterCandidate(candidate, best, rank)) best = candidate
    }

    const chosen = best ?? fallback
    if (!chosen) break
    out.push(chosen.cards.shift() as Card)
    lastEntry = chosen.entryId
  }
  return out
}

function betterCandidate(
  a: { cards: Card[] },
  b: { cards: Card[] },
  rank: Map<string, number>,
): boolean {
  if (a.cards.length !== b.cards.length) return a.cards.length > b.cards.length
  const ra = rank.get((a.cards[0] as Card).id) ?? 0
  const rb = rank.get((b.cards[0] as Card).id) ?? 0
  return ra < rb
}

/** Nombre de cartes échues par jour à venir, pour la courbe de charge. */
export function forecast(cards: Card[], days: number, now: Date): number[] {
  const buckets = new Array<number>(days).fill(0)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  for (const c of cards) {
    if (c.suspended || isNew(c)) continue
    const offset = Math.floor((c.due.getTime() - startOfToday.getTime()) / 86_400_000)
    const i = Math.min(days - 1, Math.max(0, offset))
    buckets[i] = (buckets[i] ?? 0) + 1
  }
  return buckets
}
