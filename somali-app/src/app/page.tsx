'use client'

import Link from 'next/link'
import { useDb } from '@/lib/hooks'
import { overview, todayStat } from '@/lib/db/repo'
import { currentStreak } from '@/lib/date'

export default function DashboardPage() {
  const stats = useDb((db) => overview(db))
  const today = useDb((db) => todayStat(db))
  const streak = useDb(async (db) => {
    const days = await db.dailyStats.toArray()
    return currentStreak(new Set(days.filter((d) => d.reviews > 0).map((d) => d.date)))
  })

  const loading = stats === undefined

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Af Soomaali</h1>
        <p className="text-sm text-muted">
          Répétition espacée FSRS, hors ligne, contenu alimenté par vos proches.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Stat label="À réviser" value={loading ? '—' : stats.dueNow} highlight />
        <Stat label="Nouvelles disponibles" value={loading ? '—' : stats.newAvailable} />
        <Stat label="Série" value={streak === undefined ? '—' : `${streak} j`} />
        <Stat label="Révisions aujourd’hui" value={today?.reviews ?? '—'} />
      </section>

      <Link
        href="/reviser"
        className="tap flex items-center justify-center rounded-xl bg-accent px-4 py-4 text-center text-base font-semibold text-[#08120f]"
      >
        Commencer une session
      </Link>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-muted">Contenu</h2>
        <dl className="flex flex-col gap-1 text-sm">
          <Row label="Phrases" value={loading ? '—' : stats.entries} />
          <Row label="Cartes" value={loading ? '—' : stats.cards} />
          <Row
            label="À faire valider"
            value={loading ? '—' : stats.unverified}
            warn={!loading && stats.unverified > 0}
          />
        </dl>
        {!loading && stats.entries === 0 && (
          <p className="mt-3 text-sm text-muted">
            Base vide. Ajoutez des phrases depuis « Ereyada », ou importez un fichier
            JSON depuis les réglages. Le jeu de 30 phrases de départ arrive en phase 5.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-warn/40 bg-warn/5 p-4 text-sm">
        <p className="font-semibold text-warn">Phase 2 — révision et répertoire</p>
        <p className="mt-1 text-muted">
          Session de révision (3 modes), répertoire avec recherche et validation,
          réglages FSRS et import JSON sont actifs. Audio et prononciation en phase 3.
        </p>
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string | number
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? 'border-accent/50 bg-accent/10' : 'border-border bg-surface'
      }`}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

function Row({
  label,
  value,
  warn = false,
}: {
  label: string
  value: string | number
  warn?: boolean
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${warn ? 'text-warn' : ''}`}>{value}</dd>
    </div>
  )
}
