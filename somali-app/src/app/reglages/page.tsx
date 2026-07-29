'use client'

import { useEffect, useState } from 'react'
import type { CardMode, Settings } from '@/lib/db/types'
import { CARD_MODE_HINTS, CARD_MODE_LABELS, CARD_MODES } from '@/lib/db/types'
import { getDb } from '@/lib/db/db'
import { getSettings, historyFor, saveSettings } from '@/lib/db/repo'
import { buildScheduler, recomputeCard } from '@/lib/srs/engine'
import { ImportJson } from '@/components/ImportJson'
import { StarterPackCard } from '@/components/StarterPack'

export default function ReglagesPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)

  useEffect(() => {
    void getSettings(getDb()).then(setSettings)
  }, [])

  const update = async (patch: Partial<Omit<Settings, 'key'>>) => {
    const next = await saveSettings(patch, getDb())
    setSettings(next)
    if (patch.theme) {
      document.documentElement.dataset.theme = next.theme === 'light' ? 'light' : 'dark'
    }
  }

  const toggleMode = (mode: CardMode) => {
    if (!settings) return
    const has = settings.enabledModes.includes(mode)
    const next = has
      ? settings.enabledModes.filter((m) => m !== mode)
      : [...settings.enabledModes, mode]
    if (next.length === 0) return // au moins un mode actif
    void update({ enabledModes: next })
  }

  /**
   * Rétro-calcul : rejoue l'historique de chaque carte avec les paramètres
   * FSRS courants et replanifie tout.
   */
  const recomputeAll = async () => {
    if (!settings || recomputing) return
    setRecomputing(true)
    setRecomputeMsg(null)
    try {
      const db = getDb()
      const scheduler = buildScheduler(settings.fsrs)
      const cards = await db.cards.toArray()
      let changed = 0
      for (const card of cards) {
        if (card.state === 0) continue // carte jamais vue : rien à rejouer
        const history = await historyFor(card.id, db)
        const { card: rebuilt } = recomputeCard(scheduler, card, history)
        await db.cards.put(rebuilt)
        changed += 1
      }
      setRecomputeMsg(`${changed} carte(s) replanifiée(s) avec les paramètres actuels.`)
    } finally {
      setRecomputing(false)
    }
  }

  if (!settings) {
    return <p className="py-16 text-center text-muted">Chargement…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Réglages</h1>

      {/* --- Révision ------------------------------------------------ */}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Révision</h2>

        <NumberField
          label="Nouvelles cartes par jour"
          hint="Trois cartes par phrase : 10 cartes ≈ 3 phrases nouvelles."
          value={settings.newCardsPerDay}
          min={0}
          max={100}
          onChange={(v) => void update({ newCardsPerDay: v })}
        />

        <NumberField
          label="Révisions max par jour (0 = illimité)"
          value={settings.maxReviewsPerDay}
          min={0}
          max={1000}
          onChange={(v) => void update({ maxReviewsPerDay: v })}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">Modes de carte actifs</span>
          {CARD_MODES.map((mode) => (
            <label key={mode} className="tap flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.enabledModes.includes(mode)}
                onChange={() => toggleMode(mode)}
                className="h-5 w-5 accent-[var(--color-accent)]"
              />
              <span>
                {CARD_MODE_LABELS[mode]}
                <span className="block text-xs text-muted">{CARD_MODE_HINTS[mode]}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* --- FSRS ----------------------------------------------------- */}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Algorithme FSRS</h2>

        <label className="flex flex-col gap-2 text-sm">
          <span className="flex justify-between">
            <span className="text-muted">Rétention visée</span>
            <span className="tabular-nums">
              {Math.round(settings.fsrs.requestRetention * 100)} %
            </span>
          </span>
          <input
            type="range"
            min={70}
            max={97}
            step={1}
            value={Math.round(settings.fsrs.requestRetention * 100)}
            onChange={(e) =>
              void update({
                fsrs: { ...settings.fsrs, requestRetention: Number(e.target.value) / 100 },
              })
            }
            className="tap accent-[var(--color-accent)]"
          />
          <span className="text-xs text-muted">
            Plus haut = intervalles plus courts, davantage de révisions. 90 % est un bon
            défaut.
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void recomputeAll()}
            disabled={recomputing}
            className="tap rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent disabled:opacity-40"
          >
            {recomputing ? 'Rétro-calcul en cours…' : 'Rétro-calculer toutes les cartes'}
          </button>
          <p className="text-xs text-muted">
            Rejoue tout l’historique de révision avec les paramètres ci-dessus. À lancer
            après un changement de rétention.
          </p>
          {recomputeMsg && <p className="text-xs text-ok">{recomputeMsg}</p>}
        </div>
      </section>

      {/* --- Apparence ------------------------------------------------ */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Apparence</h2>
        <div className="grid grid-cols-2 gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => void update({ theme: t })}
              className={`tap rounded-xl border px-4 py-3 text-sm ${
                settings.theme === t
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted'
              }`}
            >
              {t === 'dark' ? 'Sombre' : 'Clair'}
            </button>
          ))}
        </div>
      </section>

      {/* --- Contenu -------------------------------------------------- */}
      <StarterPackCard />
      <ImportJson />

      <section className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        <h2 className="mb-1 text-sm font-semibold text-text">Export</h2>
        <p>
          Export Anki (CSV + médias) et sauvegarde JSON complète : livrés en phase 4.
        </p>
      </section>
    </div>
  )
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, Math.round(v))))
        }}
        className="tap w-32 rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent"
      />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}
