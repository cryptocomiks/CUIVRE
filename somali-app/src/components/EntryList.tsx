'use client'

import { useState } from 'react'
import type { Entry, Level, Theme } from '@/lib/db/types'
import { LEVEL_LABELS, THEME_LABELS, THEMES } from '@/lib/db/types'
import { getDb } from '@/lib/db/db'
import {
  addListeningTime,
  deleteEntry,
  setVerified,
  toggleFavorite,
} from '@/lib/db/repo'
import { AudioButton } from './AudioButton'
import { UnverifiedBadge, VerifiedBadge } from './Badge'

export interface Filters {
  query: string
  theme: Theme | 'all'
  level: Level | 'all'
  verified: 'all' | 'yes' | 'no'
  favoritesOnly: boolean
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  theme: 'all',
  level: 'all',
  verified: 'all',
  favoritesOnly: false,
}

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: (f: Filters) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        inputMode="search"
        placeholder="Rechercher (somali ou français)…"
        value={filters.query}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
        className="tap w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent"
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        <select
          value={filters.theme}
          onChange={(e) => onChange({ ...filters, theme: e.target.value as Filters['theme'] })}
          className="tap shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          aria-label="Thème"
        >
          <option value="all">Tous les thèmes</option>
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {THEME_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={filters.level}
          onChange={(e) =>
            onChange({
              ...filters,
              level: e.target.value === 'all' ? 'all' : (Number(e.target.value) as Level),
            })
          }
          className="tap shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          aria-label="Niveau"
        >
          <option value="all">Tous niveaux</option>
          {([1, 2, 3] as const).map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l]}
            </option>
          ))}
        </select>
        <select
          value={filters.verified}
          onChange={(e) =>
            onChange({ ...filters, verified: e.target.value as Filters['verified'] })
          }
          className="tap shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          aria-label="Statut de vérification"
        >
          <option value="all">Vérifiées ou non</option>
          <option value="no">À valider</option>
          <option value="yes">Vérifiées</option>
        </select>
        <button
          type="button"
          onClick={() => onChange({ ...filters, favoritesOnly: !filters.favoritesOnly })}
          className={`tap shrink-0 rounded-lg border px-3 py-2 text-sm ${
            filters.favoritesOnly
              ? 'border-warn/60 bg-warn/10 text-warn'
              : 'border-border bg-surface text-muted'
          }`}
        >
          ★ Favoris
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function EntryRow({ entry }: { entry: Entry }) {
  const [open, setOpen] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [name, setName] = useState('')

  const confirmVerify = async () => {
    await setVerified(entry.id, true, name.trim() || undefined, getDb())
    setVerifying(false)
    setName('')
  }

  return (
    <li className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="tap flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="somali block truncate text-lg">{entry.somali}</span>
          <span className="block truncate text-sm text-muted">{entry.french}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 pt-1">
          {entry.favorite && <span className="text-warn">★</span>}
          {!entry.verified && <span className="h-2 w-2 rounded-full bg-warn" aria-label="Non vérifiée" />}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-full bg-surface-2 px-2 py-0.5">
              {THEME_LABELS[entry.theme]}
            </span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5">
              {LEVEL_LABELS[entry.level]}
            </span>
            {entry.verified ? <VerifiedBadge by={entry.verifiedBy} /> : <UnverifiedBadge />}
          </div>

          {entry.literal && (
            <p className="text-sm text-muted">littéral : {entry.literal}</p>
          )}
          {entry.notes && <p className="text-sm text-muted">{entry.notes}</p>}
          <p className="text-xs text-muted">source : {entry.source}</p>

          <div className="flex items-center gap-3">
            <AudioButton
              entry={entry}
              onPlayed={(ms) => void addListeningTime(ms, getDb())}
            />
            <button
              type="button"
              onClick={() => void toggleFavorite(entry.id, getDb())}
              className={`tap rounded-lg border px-3 py-2 text-sm ${
                entry.favorite
                  ? 'border-warn/60 bg-warn/10 text-warn'
                  : 'border-border text-muted'
              }`}
            >
              ★ {entry.favorite ? 'Retirer' : 'Favori'}
            </button>
            {!entry.verified && !verifying && (
              <button
                type="button"
                onClick={() => setVerifying(true)}
                className="tap rounded-lg border border-ok/50 bg-ok/10 px-3 py-2 text-sm text-ok"
              >
                ✓ Valider
              </button>
            )}
          </div>

          {verifying && (
            <div className="flex flex-col gap-2 rounded-lg border border-ok/40 bg-ok/5 p-3">
              <p className="text-sm">
                Un locuteur natif a confirmé cette phrase (texte et sens) ?
              </p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nom du locuteur (facultatif)"
                className="tap rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void confirmVerify()}
                  className="tap flex-1 rounded-lg bg-ok px-3 py-2 text-sm font-semibold text-[#08120f]"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setVerifying(false)}
                  className="tap rounded-lg border border-border px-3 py-2 text-sm text-muted"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Supprimer « ${entry.somali} » et ses cartes ?`)) {
                void deleteEntry(entry.id, getDb())
              }
            }}
            className="tap self-start text-xs text-danger"
          >
            Supprimer cette phrase
          </button>
        </div>
      )}
    </li>
  )
}
