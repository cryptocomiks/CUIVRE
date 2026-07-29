import { describe, expect, it } from 'vitest'
import { currentStreak, dayKey, lastDays, startOfDay } from './date'

describe('dayKey', () => {
  it('formate en YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })
})

describe('startOfDay', () => {
  it('ramène à minuit', () => {
    const d = startOfDay(new Date(2026, 4, 10, 17, 42, 13))
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(dayKey(d)).toBe('2026-05-10')
  })
})

describe('lastDays', () => {
  it('renvoie les n derniers jours, du plus ancien au plus récent', () => {
    const days = lastDays(3, new Date(2026, 2, 10, 12))
    expect(days).toEqual(['2026-03-08', '2026-03-09', '2026-03-10'])
  })
})

describe('currentStreak', () => {
  const today = new Date(2026, 2, 10, 12)

  it('compte les jours consécutifs jusqu’à aujourd’hui', () => {
    const set = new Set(['2026-03-10', '2026-03-09', '2026-03-08'])
    expect(currentStreak(set, today)).toBe(3)
  })

  it('ne casse pas la série si la journée en cours n’a pas encore de révision', () => {
    const set = new Set(['2026-03-09', '2026-03-08'])
    expect(currentStreak(set, today)).toBe(2)
  })

  it('casse la série après deux jours sans révision', () => {
    const set = new Set(['2026-03-08', '2026-03-07'])
    expect(currentStreak(set, today)).toBe(0)
  })

  it('renvoie 0 sans historique', () => {
    expect(currentStreak(new Set(), today)).toBe(0)
  })
})
