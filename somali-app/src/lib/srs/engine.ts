import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type FSRS,
  type FSRSHistory,
  type Grade,
  type RecordLogItem,
  type ReviewLog as FsrsReviewLog,
  type Steps,
} from 'ts-fsrs'
import type { Card, CardMode, FsrsSettings, ReviewLogEntry } from '@/lib/db/types'

export { Rating, State }
export type { Grade }

/** Les quatre notes proposées en session, dans l'ordre d'affichage. */
export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]

export const GRADE_LABELS: Record<Grade, string> = {
  [Rating.Again]: 'À revoir',
  [Rating.Hard]: 'Difficile',
  [Rating.Good]: 'Correct',
  [Rating.Easy]: 'Facile',
}

/* ------------------------------------------------------------------ */
/* Construction du planificateur                                       */
/* ------------------------------------------------------------------ */

export function buildScheduler(settings: FsrsSettings): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: settings.requestRetention,
      maximum_interval: settings.maximumInterval,
      w: settings.w,
      enable_fuzz: settings.enableFuzz,
      enable_short_term: settings.enableShortTerm,
      learning_steps: settings.learningSteps as Steps,
      relearning_steps: settings.relearningSteps as Steps,
    }),
  )
}

/* ------------------------------------------------------------------ */
/* Conversions entre notre `Card` (Dexie) et celle de ts-fsrs          */
/* ------------------------------------------------------------------ */

export function toFsrsCard(card: Card): FsrsCard {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
    ...(card.last_review ? { last_review: card.last_review } : {}),
  }
}

function mergeFsrsCard(card: Card, next: FsrsCard): Card {
  const merged: Card = {
    ...card,
    due: next.due,
    stability: next.stability,
    difficulty: next.difficulty,
    elapsed_days: next.elapsed_days,
    scheduled_days: next.scheduled_days,
    learning_steps: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
  }
  if (next.last_review) merged.last_review = next.last_review
  else delete merged.last_review
  return merged
}

/* ------------------------------------------------------------------ */
/* Création                                                            */
/* ------------------------------------------------------------------ */

export function newCardId(entryId: string, mode: CardMode): string {
  return `${entryId}:${mode}`
}

/**
 * Crée une carte neuve pour une entrée et un mode.
 *
 * L'identifiant est déterministe (`<entryId>:<mode>`) : réimporter la même
 * entrée ne duplique jamais ses cartes.
 */
export function createCard(entryId: string, mode: CardMode, now = new Date()): Card {
  const empty = createEmptyCard(now)
  return {
    id: newCardId(entryId, mode),
    entryId,
    mode,
    due: empty.due,
    stability: empty.stability,
    difficulty: empty.difficulty,
    elapsed_days: empty.elapsed_days,
    scheduled_days: empty.scheduled_days,
    learning_steps: empty.learning_steps,
    reps: empty.reps,
    lapses: empty.lapses,
    state: empty.state,
    suspended: false,
    createdAt: now.getTime(),
  }
}

/* ------------------------------------------------------------------ */
/* Aperçu et notation                                                  */
/* ------------------------------------------------------------------ */

export interface GradePreview {
  grade: Grade
  label: string
  due: Date
  /** Intervalle en jours tel que planifié par FSRS. */
  scheduledDays: number
  /** Libellé français court affiché sous le bouton (« 10 min », « 3 j »…). */
  interval: string
}

/** Intervalles proposés pour les quatre boutons, sans modifier la carte. */
export function previewGrades(
  scheduler: FSRS,
  card: Card,
  now = new Date(),
): GradePreview[] {
  const preview = scheduler.repeat(toFsrsCard(card), now)
  return GRADES.map((grade) => {
    const item = preview[grade]
    return {
      grade,
      label: GRADE_LABELS[grade],
      due: item.card.due,
      scheduledDays: item.card.scheduled_days,
      interval: formatInterval(item.card.due.getTime() - now.getTime()),
    }
  })
}

export interface RatingResult {
  card: Card
  log: ReviewLogEntry
}

/** Applique une note et renvoie la carte mise à jour + la ligne de journal. */
export function rateCard(
  scheduler: FSRS,
  card: Card,
  grade: Grade,
  now = new Date(),
  durationMs?: number,
): RatingResult {
  const item: RecordLogItem = scheduler.next(toFsrsCard(card), now, grade)
  return {
    card: mergeFsrsCard(card, item.card),
    log: toLogEntry(card, item.log, durationMs),
  }
}

function toLogEntry(
  card: Card,
  log: FsrsReviewLog,
  durationMs?: number,
): ReviewLogEntry {
  const entry: ReviewLogEntry = {
    cardId: card.id,
    entryId: card.entryId,
    mode: card.mode,
    rating: log.rating,
    state: log.state,
    due: log.due,
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: log.review,
  }
  if (durationMs !== undefined) entry.durationMs = durationMs
  return entry
}

/** Annule la dernière note : restitue l'état antérieur de la carte. */
export function undoRating(scheduler: FSRS, card: Card, log: ReviewLogEntry): Card {
  const prev = scheduler.rollback(toFsrsCard(card), {
    rating: log.rating as Rating,
    state: log.state as State,
    due: log.due,
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: log.review,
  })
  return mergeFsrsCard(card, prev)
}

/** Remet une carte à zéro (« oubliée »), en conservant l'historique. */
export function forgetCard(
  scheduler: FSRS,
  card: Card,
  now = new Date(),
  resetCount = false,
): RatingResult {
  const item = scheduler.forget(toFsrsCard(card), now, resetCount)
  return { card: mergeFsrsCard(card, item.card), log: toLogEntry(card, item.log) }
}

/** Probabilité de rappel estimée à l'instant `now` (0 → 1). */
export function retrievability(scheduler: FSRS, card: Card, now = new Date()): number {
  return scheduler.get_retrievability(toFsrsCard(card), now, false)
}

/* ------------------------------------------------------------------ */
/* Rétro-calcul                                                        */
/* ------------------------------------------------------------------ */

export interface RecomputeResult {
  card: Card
  /** Journal reconstruit, dans l'ordre chronologique. */
  logs: ReviewLogEntry[]
}

/**
 * Rétro-calcul : rejoue tout l'historique d'une carte avec les paramètres
 * FSRS courants.
 *
 * À utiliser après un changement de rétention visée ou de poids `w` : la
 * planification existante devient sinon incohérente avec les nouveaux
 * paramètres.
 */
export function recomputeCard(
  scheduler: FSRS,
  card: Card,
  history: ReviewLogEntry[],
  now = new Date(),
): RecomputeResult {
  const ordered = [...history].sort((a, b) => a.review.getTime() - b.review.getTime())
  if (ordered.length === 0) {
    return { card: createCardFromExisting(card, now), logs: [] }
  }

  const reviews: FSRSHistory[] = ordered.map((log) => ({
    rating: log.rating as Grade,
    review: log.review,
  }))

  const result = scheduler.reschedule(toFsrsCard(card), reviews, {
    now,
    skipManual: true,
    update_memory_state: true,
    first_card: toFsrsCard(createCardFromExisting(card, new Date(card.createdAt))),
  })

  const collections = result.collections
  const last = collections[collections.length - 1]
  const rebuilt = last ? mergeFsrsCard(card, last.card) : card

  return {
    card: rebuilt,
    logs: collections.map((item, i) =>
      toLogEntry(card, item.log, ordered[i]?.durationMs),
    ),
  }
}

function createCardFromExisting(card: Card, now: Date): Card {
  const fresh = createCard(card.entryId, card.mode, now)
  return { ...fresh, id: card.id, suspended: card.suspended, createdAt: card.createdAt }
}

/* ------------------------------------------------------------------ */
/* Formatage                                                           */
/* ------------------------------------------------------------------ */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Intervalle lisible en français : « 5 min », « 3 h », « 12 j », « 2,5 ans ». */
export function formatInterval(ms: number): string {
  const abs = Math.max(0, ms)
  if (abs < HOUR) return `${Math.max(1, Math.round(abs / MINUTE))} min`
  if (abs < DAY) return `${Math.round(abs / HOUR)} h`
  const days = abs / DAY
  if (days < 30) return `${Math.round(days)} j`
  if (days < 365) return `${round1(days / 30)} mois`
  return `${round1(days / 365)} an${days / 365 >= 2 ? 's' : ''}`
}

function round1(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '').replace('.', ',')
}
