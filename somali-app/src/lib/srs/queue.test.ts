import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { buildQueue, dueCards, forecast } from './queue'
import { createCard } from './engine'
import { CARD_MODES } from '@/lib/db/types'
import type { Card, CardMode } from '@/lib/db/types'

const NOW = new Date('2026-03-10T08:00:00Z')
const hours = (n: number): Date => new Date(NOW.getTime() + n * 3_600_000)

function card(
  entryId: string,
  mode: CardMode,
  overrides: Partial<Card> = {},
): Card {
  return { ...createCard(entryId, mode, NOW), ...overrides }
}

function reviewCard(entryId: string, mode: CardMode, dueAt: Date): Card {
  return card(entryId, mode, { state: State.Review, due: dueAt, reps: 3 })
}

const baseOptions = {
  now: NOW,
  newCardsPerDay: 10,
  newIntroducedToday: 0,
  maxReviewsPerDay: 0,
  reviewsDoneToday: 0,
  enabledModes: [...CARD_MODES],
}

describe('dueCards', () => {
  it('ne retient que les cartes échues, non neuves et non suspendues', () => {
    const cards = [
      reviewCard('a', 'recognition', hours(-1)),
      reviewCard('b', 'recognition', hours(+1)),
      reviewCard('c', 'recognition', hours(-2)),
      { ...reviewCard('d', 'recognition', hours(-3)), suspended: true },
      card('e', 'recognition'),
    ]
    expect(dueCards(cards, NOW).map((c) => c.entryId).sort()).toEqual(['a', 'c'])
  })
})

describe('buildQueue — plafond de nouvelles cartes', () => {
  it('respecte le plafond quotidien', () => {
    const cards = Array.from({ length: 25 }, (_, i) => card(`e${i}`, 'recognition'))
    const { counts } = buildQueue(cards, baseOptions)
    expect(counts.new).toBe(10)
  })

  it('déduit les nouvelles cartes déjà vues aujourd’hui', () => {
    const cards = Array.from({ length: 25 }, (_, i) => card(`e${i}`, 'recognition'))
    const { counts } = buildQueue(cards, { ...baseOptions, newIntroducedToday: 7 })
    expect(counts.new).toBe(3)
  })

  it('n’introduit plus rien une fois le plafond atteint', () => {
    const cards = Array.from({ length: 25 }, (_, i) => card(`e${i}`, 'recognition'))
    const { counts } = buildQueue(cards, { ...baseOptions, newIntroducedToday: 12 })
    expect(counts.new).toBe(0)
  })

  it('introduit les cartes les plus anciennes en premier', () => {
    const cards = [
      card('recent', 'recognition', { createdAt: NOW.getTime() }),
      card('ancienne', 'recognition', { createdAt: NOW.getTime() - 86_400_000 * 30 }),
    ]
    const { queue } = buildQueue(cards, { ...baseOptions, newCardsPerDay: 1 })
    expect(queue).toHaveLength(1)
    expect(queue[0]?.entryId).toBe('ancienne')
  })
})

describe('buildQueue — sélection des cartes échues', () => {
  it('ignore les cartes non encore échues', () => {
    const cards = [
      reviewCard('a', 'recognition', hours(-1)),
      reviewCard('b', 'recognition', hours(+5)),
    ]
    const { queue } = buildQueue(cards, baseOptions)
    expect(queue.map((c) => c.entryId)).toEqual(['a'])
  })

  it('place les cartes en apprentissage avant les révisions', () => {
    const cards = [
      reviewCard('rev', 'recognition', hours(-10)),
      card('learn', 'recognition', {
        state: State.Learning,
        due: hours(-1),
        reps: 1,
      }),
    ]
    const { queue } = buildQueue(cards, baseOptions)
    expect(queue[0]?.entryId).toBe('learn')
  })

  it('trie les révisions par échéance croissante', () => {
    const cards = [
      reviewCard('c', 'recognition', hours(-1)),
      reviewCard('a', 'recognition', hours(-9)),
      reviewCard('b', 'recognition', hours(-5)),
    ]
    const { queue } = buildQueue(cards, baseOptions)
    expect(queue.map((c) => c.entryId)).toEqual(['a', 'b', 'c'])
  })

  it('applique le plafond de révisions quotidiennes', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      reviewCard(`e${i}`, 'recognition', hours(-i - 1)),
    )
    const { counts } = buildQueue(cards, {
      ...baseOptions,
      maxReviewsPerDay: 15,
      reviewsDoneToday: 5,
    })
    expect(counts.review).toBe(10)
  })

  it('traite 0 comme « illimité »', () => {
    const cards = Array.from({ length: 40 }, (_, i) =>
      reviewCard(`e${i}`, 'recognition', hours(-i - 1)),
    )
    const { counts } = buildQueue(cards, {
      ...baseOptions,
      maxReviewsPerDay: 0,
      reviewsDoneToday: 999,
    })
    expect(counts.review).toBe(40)
  })
})

describe('buildQueue — modes', () => {
  it('exclut les modes désactivés', () => {
    const cards = CARD_MODES.map((m) => reviewCard('e', m, hours(-1)))
    const { queue } = buildQueue(cards, {
      ...baseOptions,
      enabledModes: ['listening'],
    })
    expect(queue.map((c) => c.mode)).toEqual(['listening'])
  })

  it('mélange les trois modes dans une même session', () => {
    const cards = ['a', 'b', 'c'].flatMap((e) =>
      CARD_MODES.map((m) => reviewCard(e, m, hours(-1))),
    )
    const { queue } = buildQueue(cards, baseOptions)
    expect(new Set(queue.map((c) => c.mode)).size).toBe(3)
  })
})

describe('buildQueue — espacement des cartes sœurs', () => {
  it('n’enchaîne pas deux cartes de la même phrase', () => {
    const cards = ['a', 'b', 'c'].flatMap((e) =>
      CARD_MODES.map((m) => reviewCard(e, m, hours(-1))),
    )
    const { queue } = buildQueue(cards, baseOptions)
    expect(queue).toHaveLength(9)
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i]?.entryId).not.toBe(queue[i - 1]?.entryId)
    }
  })

  it('accepte la répétition quand il n’y a plus d’alternative', () => {
    const cards = CARD_MODES.map((m) => reviewCard('seule', m, hours(-1)))
    const { queue } = buildQueue(cards, baseOptions)
    expect(queue).toHaveLength(3)
    expect(new Set(queue.map((c) => c.mode)).size).toBe(3)
  })

  it('ne perd ni ne duplique aucune carte', () => {
    const cards = ['a', 'b', 'c', 'd'].flatMap((e) =>
      CARD_MODES.map((m) => reviewCard(e, m, hours(-1))),
    )
    const { queue } = buildQueue(cards, baseOptions)
    expect(new Set(queue.map((c) => c.id)).size).toBe(cards.length)
  })
})

describe('buildQueue — nouvelles cartes réparties', () => {
  it('ne groupe pas les nouvelles cartes en fin de session', () => {
    const reviews = Array.from({ length: 12 }, (_, i) =>
      reviewCard(`r${i}`, 'recognition', hours(-i - 1)),
    )
    const fresh = Array.from({ length: 4 }, (_, i) => card(`n${i}`, 'recognition'))
    const { queue } = buildQueue([...reviews, ...fresh], baseOptions)
    const positions = queue
      .map((c, i) => (c.state === State.New ? i : -1))
      .filter((i) => i >= 0)
    expect(positions).toHaveLength(4)
    expect(positions[0]).toBeLessThan(4)
    expect(Math.max(...positions)).toBeGreaterThan(queue.length / 2)
  })

  it('renvoie une file vide sans carte disponible', () => {
    const { queue, counts } = buildQueue([], baseOptions)
    expect(queue).toEqual([])
    expect(counts).toEqual({ new: 0, learning: 0, review: 0, total: 0 })
  })
})

describe('buildQueue — limite de session', () => {
  it('tronque la file à la limite demandée', () => {
    const cards = Array.from({ length: 30 }, (_, i) =>
      reviewCard(`e${i}`, 'recognition', hours(-i - 1)),
    )
    const { queue, counts } = buildQueue(cards, { ...baseOptions, sessionLimit: 8 })
    expect(queue).toHaveLength(8)
    expect(counts.total).toBe(8)
  })
})

describe('forecast', () => {
  it('répartit les cartes par jour d’échéance', () => {
    const cards = [
      reviewCard('a', 'recognition', hours(-30)),
      reviewCard('b', 'recognition', hours(2)),
      reviewCard('c', 'recognition', new Date(NOW.getTime() + 3 * 86_400_000)),
      card('neuve', 'recognition'),
    ]
    const buckets = forecast(cards, 7, NOW)
    expect(buckets).toHaveLength(7)
    // a (en retard) et b (dans 2 h) tombent aujourd'hui ; la neuve est ignorée.
    expect(buckets[0]).toBe(2)
    expect(buckets[3]).toBe(1)
    expect(buckets.reduce((s, n) => s + n, 0)).toBe(3)
  })
})
