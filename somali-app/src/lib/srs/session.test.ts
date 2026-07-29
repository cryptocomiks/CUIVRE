import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SomaliDB } from '@/lib/db/db'
import { addEntry, recordReview, saveSettings, todayStat, undoReview } from '@/lib/db/repo'
import { buildScheduler, rateCard, Rating } from './engine'
import { defaultSettings } from './defaults'
import { loadSession, shouldRequeue } from './session'

let db: SomaliDB
let counter = 100

beforeEach(async () => {
  counter += 1
  db = new SomaliDB(`session-db-${counter}`)
  await db.open()
})

const base = {
  french: 'Bonjour',
  theme: 'salutations' as const,
  source: 'Test',
}

describe('loadSession', () => {
  it('écarte les cartes « écoute » des entrées sans audio', async () => {
    await addEntry({ ...base, somali: 'Nabad' }, db)
    const { queue } = await loadSession(db)
    expect(queue.some((c) => c.mode === 'listening')).toBe(false)
    expect(queue.filter((c) => c.mode !== 'listening')).toHaveLength(2)
  })

  it('garde les cartes « écoute » dès qu’un audio est rattaché', async () => {
    const entry = await addEntry({ ...base, somali: 'Nabad' }, db)
    await db.entries.update(entry.id, { audioIds: ['a1'] })
    const { queue } = await loadSession(db)
    expect(queue.some((c) => c.mode === 'listening')).toBe(true)
  })

  it('ignore les cartes orphelines', async () => {
    const entry = await addEntry({ ...base, somali: 'Nabad' }, db)
    await db.entries.delete(entry.id) // suppression directe, cartes laissées
    const { queue } = await loadSession(db)
    expect(queue).toHaveLength(0)
  })

  it('respecte les modes désactivés dans les réglages', async () => {
    await addEntry({ ...base, somali: 'Nabad' }, db)
    await saveSettings({ enabledModes: ['recognition'] }, db)
    const { queue } = await loadSession(db)
    expect(queue.map((c) => c.mode)).toEqual(['recognition'])
  })

  it('déduit du plafond les nouvelles cartes déjà étudiées aujourd’hui', async () => {
    for (let i = 0; i < 6; i++) {
      await addEntry({ ...base, somali: `Eray ${i}`, french: `Mot ${i}` }, db)
    }
    await saveSettings({ newCardsPerDay: 4 }, db)

    const first = await loadSession(db)
    expect(first.counts.new).toBe(4)

    // On étudie 2 nouvelles cartes...
    const scheduler = buildScheduler(defaultSettings().fsrs)
    for (const card of first.queue.slice(0, 2)) {
      const res = rateCard(scheduler, card, Rating.Good)
      await recordReview(res.card, res.log, true, db)
    }
    // ... la session suivante n'en propose plus que 2.
    const second = await loadSession(db)
    expect(second.counts.new).toBe(2)
  })
})

describe('undoReview', () => {
  it('restaure la carte, le journal et les compteurs', async () => {
    const entry = await addEntry({ ...base, somali: 'Nabad' }, db)
    const scheduler = buildScheduler(defaultSettings().fsrs)
    const card = (await db.cards.get(`${entry.id}:recognition`))!

    const res = rateCard(scheduler, card, Rating.Good, new Date(), 2500)
    const seq = await recordReview(res.card, res.log, true, db)
    expect((await todayStat(db)).reviews).toBe(1)

    await undoReview(card, seq, res.log, true, db)

    const restored = await db.cards.get(card.id)
    expect(restored?.reps).toBe(0)
    expect(restored?.state).toBe(0)
    expect(await db.reviewLogs.count()).toBe(0)
    const stat = await todayStat(db)
    expect(stat.reviews).toBe(0)
    expect(stat.newCards).toBe(0)
    expect(stat.correct).toBe(0)
    expect(stat.studyMs).toBe(0)
  })
})

describe('shouldRequeue', () => {
  const now = new Date('2026-03-10T10:00:00Z')
  const cardDueIn = (min: number) => ({
    due: new Date(now.getTime() + min * 60_000),
  })

  it('remet en file une carte échue dans moins de 15 minutes', () => {
    expect(shouldRequeue(cardDueIn(1) as never, now)).toBe(true)
    expect(shouldRequeue(cardDueIn(10) as never, now)).toBe(true)
  })

  it('laisse partir une carte planifiée plus loin', () => {
    expect(shouldRequeue(cardDueIn(60) as never, now)).toBe(false)
    expect(shouldRequeue(cardDueIn(60 * 24) as never, now)).toBe(false)
  })
})
