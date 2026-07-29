/** Clé de jour local `YYYY-MM-DD`, utilisée par les statistiques quotidiennes. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Début du jour local. */
export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Liste des `n` derniers jours (clés locales), du plus ancien au plus récent. */
export function lastDays(n: number, from: Date = new Date()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(dayKey(new Date(from.getTime() - i * 86_400_000)))
  }
  return out
}

/**
 * Série de jours consécutifs d'étude, en remontant depuis aujourd'hui.
 * Une journée sans révision interrompt la série ; le jour même ne la rompt pas
 * tant qu'il n'est pas terminé.
 */
export function currentStreak(daysWithReviews: Set<string>, today: Date = new Date()): number {
  let streak = 0
  let cursor = new Date(today)
  if (!daysWithReviews.has(dayKey(cursor))) {
    cursor = new Date(cursor.getTime() - 86_400_000)
  }
  while (daysWithReviews.has(dayKey(cursor))) {
    streak += 1
    cursor = new Date(cursor.getTime() - 86_400_000)
  }
  return streak
}
