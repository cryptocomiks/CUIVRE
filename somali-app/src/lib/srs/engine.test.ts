import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import {
  buildScheduler,
  createCard,
  formatInterval,
  forgetCard,
  GRADES,
  previewGrades,
  Rating,
  rateCard,
  recomputeCard,
  retrievability,
  undoRating,
} from './engine'
import type { Grade } from './engine'
import { defaultSettings } from './defaults'
import type { ReviewLogEntry } from '@/lib/db/types'

const settings = defaultSettings()
const scheduler = buildScheduler(settings.fsrs)
const T0 = new Date('2026-01-01T09:00:00Z')
const days = (n: number, from: Date = T0): Date =>
  new Date(from.getTime() + n * 86_400_000)

describe('createCard', () => {
  it('produit une carte neuve échue immédiatement', () => {
    const card = createCard('entry-1', 'listening', T0)
    expect(card.state).toBe(State.New)
    expect(card.reps).toBe(0)
    expect(card.lapses).toBe(0)
    expect(card.suspended).toBe(false)
    expect(card.due.getTime()).toBe(T0.getTime())
  })

  it('donne un identifiant déterministe entryId:mode', () => {
    expect(createCard('abc', 'production', T0).id).toBe('abc:production')
    expect(createCard('abc', 'production', days(5)).id).toBe('abc:production')
  })
})

describe('previewGrades', () => {
  it('propose les quatre notes dans l’ordre Again → Easy', () => {
    const preview = previewGrades(scheduler, createCard('e', 'recognition', T0), T0)
    expect(preview.map((p) => p.grade)).toEqual(GRADES)
    expect(preview.map((p) => p.label)).toEqual([
      'À revoir',
      'Difficile',
      'Correct',
      'Facile',
    ])
  })

  it('ordonne les échéances de façon croissante', () => {
    const preview = previewGrades(scheduler, createCard('e', 'recognition', T0), T0)
    const dues = preview.map((p) => p.due.getTime())
    for (let i = 1; i < dues.length; i++) {
      expect(dues[i]).toBeGreaterThanOrEqual(dues[i - 1] as number)
    }
  })

  it('ne modifie pas la carte source', () => {
    const card = createCard('e', 'recognition', T0)
    const snapshot = { ...card }
    previewGrades(scheduler, card, T0)
    expect(card).toEqual(snapshot)
  })
})

describe('rateCard', () => {
  it('fait passer une carte neuve en apprentissage', () => {
    const { card, log } = rateCard(scheduler, createCard('e', 'recognition', T0), Rating.Good, T0)
    expect(card.state).toBe(State.Learning)
    expect(card.reps).toBe(1)
    expect(log.rating).toBe(Rating.Good)
    // Le log conserve l'état AVANT la note.
    expect(log.state).toBe(State.New)
  })

  it('applique les paliers d’apprentissage configurés', () => {
    // learningSteps = ['1m', '10m'] : « Correct » sur une carte neuve → 10 min.
    const { card } = rateCard(scheduler, createCard('e', 'recognition', T0), Rating.Good, T0)
    expect(card.due.getTime() - T0.getTime()).toBe(10 * 60_000)
  })

  it('compte un oubli quand une carte en révision est notée « À revoir »', () => {
    let card = createCard('e', 'listening', T0)
    let now = T0
    for (const grade of [Rating.Easy, Rating.Good, Rating.Good] as const) {
      const res = rateCard(scheduler, card, grade, now)
      card = res.card
      now = new Date(card.due.getTime())
    }
    expect(card.state).toBe(State.Review)
    const lapsesBefore = card.lapses
    const relapsed = rateCard(scheduler, card, Rating.Again, now).card
    expect(relapsed.lapses).toBe(lapsesBefore + 1)
    expect(relapsed.state).toBe(State.Relearning)
  })

  it('allonge l’intervalle à chaque révision réussie', () => {
    let card = createCard('e', 'production', T0)
    let now = T0
    const intervals: number[] = []
    for (let i = 0; i < 6; i++) {
      const res = rateCard(scheduler, card, Rating.Good, now)
      card = res.card
      now = new Date(card.due.getTime())
      if (card.state === State.Review) intervals.push(card.scheduled_days)
    }
    expect(intervals.length).toBeGreaterThan(1)
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1] as number)
    }
  })

  it('journalise la durée passée sur la carte', () => {
    const { log } = rateCard(
      scheduler,
      createCard('e', 'recognition', T0),
      Rating.Good,
      T0,
      4200,
    )
    expect(log.durationMs).toBe(4200)
    expect(log.cardId).toBe('e:recognition')
    expect(log.mode).toBe('recognition')
  })

  it('respecte la rétention visée : une exigence plus forte raccourcit l’intervalle', () => {
    const strict = buildScheduler({ ...settings.fsrs, requestRetention: 0.97 })
    const loose = buildScheduler({ ...settings.fsrs, requestRetention: 0.8 })
    const seed = createCard('e', 'listening', T0)
    const strictCard = rateCard(strict, seed, Rating.Easy, T0).card
    const looseCard = rateCard(loose, seed, Rating.Easy, T0).card
    expect(strictCard.scheduled_days).toBeLessThan(looseCard.scheduled_days)
  })
})

describe('undoRating', () => {
  it('restitue exactement l’état antérieur', () => {
    const before = createCard('e', 'recognition', T0)
    const { card, log } = rateCard(scheduler, before, Rating.Hard, T0)
    const restored = undoRating(scheduler, card, log)
    expect(restored.state).toBe(before.state)
    expect(restored.reps).toBe(before.reps)
    expect(restored.lapses).toBe(before.lapses)
    expect(restored.stability).toBe(before.stability)
    expect(restored.difficulty).toBe(before.difficulty)
    expect(restored.due.getTime()).toBe(before.due.getTime())
  })

  it('conserve les champs propres à l’application', () => {
    const before = { ...createCard('e', 'recognition', T0), suspended: true }
    const { card, log } = rateCard(scheduler, before, Rating.Good, T0)
    const restored = undoRating(scheduler, card, log)
    expect(restored.suspended).toBe(true)
    expect(restored.entryId).toBe('e')
    expect(restored.mode).toBe('recognition')
  })
})

describe('forgetCard', () => {
  it('remet la carte à l’état neuf, échue maintenant', () => {
    let card = createCard('e', 'listening', T0)
    let now = T0
    for (let i = 0; i < 4; i++) {
      const res = rateCard(scheduler, card, Rating.Good, now)
      card = res.card
      now = new Date(card.due.getTime())
    }
    expect(card.state).toBe(State.Review)
    const { card: forgotten } = forgetCard(scheduler, card, now)
    expect(forgotten.state).toBe(State.New)
    expect(forgotten.due.getTime()).toBe(now.getTime())
  })
})

describe('retrievability', () => {
  it('décroît avec le temps écoulé', () => {
    let card = createCard('e', 'recognition', T0)
    let now = T0
    for (let i = 0; i < 4; i++) {
      const res = rateCard(scheduler, card, Rating.Good, now)
      card = res.card
      now = new Date(card.due.getTime())
    }
    const r1 = retrievability(scheduler, card, now)
    const r2 = retrievability(scheduler, card, days(30, now))
    expect(r1).toBeGreaterThan(r2)
    expect(r1).toBeLessThanOrEqual(1)
    expect(r2).toBeGreaterThanOrEqual(0)
  })
})

describe('recomputeCard (rétro-calcul)', () => {
  const replay = (grades: readonly Grade[]) => {
    let card = createCard('e', 'listening', T0)
    let now = T0
    const logs: ReviewLogEntry[] = []
    for (const g of grades) {
      const res = rateCard(scheduler, card, g, now)
      card = res.card
      logs.push(res.log)
      now = new Date(card.due.getTime())
    }
    return { card, logs, now }
  }

  it('reproduit l’état courant quand les paramètres n’ont pas changé', () => {
    const { card, logs, now } = replay([Rating.Good, Rating.Good, Rating.Good, Rating.Good])
    const { card: rebuilt } = recomputeCard(scheduler, card, logs, now)
    expect(rebuilt.state).toBe(card.state)
    expect(rebuilt.reps).toBe(card.reps)
    expect(rebuilt.lapses).toBe(card.lapses)
    expect(rebuilt.stability).toBeCloseTo(card.stability, 4)
    expect(rebuilt.difficulty).toBeCloseTo(card.difficulty, 4)
    expect(rebuilt.due.getTime()).toBe(card.due.getTime())
  })

  it('replanifie la carte quand la rétention visée change', () => {
    const { card, logs, now } = replay([Rating.Good, Rating.Good, Rating.Good, Rating.Good])
    const strict = buildScheduler({ ...settings.fsrs, requestRetention: 0.95 })
    const { card: rebuilt } = recomputeCard(strict, card, logs, now)
    expect(rebuilt.due.getTime()).toBeLessThan(card.due.getTime())
    expect(rebuilt.reps).toBe(card.reps)
  })

  it('accepte un historique désordonné', () => {
    const { card, logs, now } = replay([Rating.Good, Rating.Again, Rating.Good])
    const shuffled = [logs[2], logs[0], logs[1]] as ReviewLogEntry[]
    const ordered = recomputeCard(scheduler, card, logs, now)
    const unordered = recomputeCard(scheduler, card, shuffled, now)
    expect(unordered.card.due.getTime()).toBe(ordered.card.due.getTime())
    expect(unordered.card.stability).toBeCloseTo(ordered.card.stability, 6)
  })

  it('renvoie une carte neuve si l’historique est vide', () => {
    const { card } = replay([Rating.Good, Rating.Good])
    const { card: rebuilt, logs } = recomputeCard(scheduler, card, [], T0)
    expect(rebuilt.state).toBe(State.New)
    expect(rebuilt.reps).toBe(0)
    expect(rebuilt.id).toBe(card.id)
    expect(logs).toEqual([])
  })
})

describe('formatInterval', () => {
  it('formate en français', () => {
    expect(formatInterval(60_000)).toBe('1 min')
    expect(formatInterval(10 * 60_000)).toBe('10 min')
    expect(formatInterval(3 * 3_600_000)).toBe('3 h')
    expect(formatInterval(12 * 86_400_000)).toBe('12 j')
    expect(formatInterval(90 * 86_400_000)).toBe('3 mois')
    expect(formatInterval(365 * 86_400_000)).toBe('1 an')
    expect(formatInterval(2 * 365 * 86_400_000)).toBe('2 ans')
  })

  it('n’affiche jamais de valeur négative', () => {
    expect(formatInterval(-5000)).toBe('1 min')
  })
})
