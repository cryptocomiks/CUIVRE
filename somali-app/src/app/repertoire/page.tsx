'use client'

import { useState } from 'react'
import { useDb } from '@/lib/hooks'
import { filterEntries } from '@/lib/db/repo'
import { AddEntryForm } from '@/components/AddEntryForm'
import { EMPTY_FILTERS, EntryRow, FilterBar, type Filters } from '@/components/EntryList'

const PAGE_SIZE = 50

export default function RepertoirePage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const entries = useDb(async (db) => {
    const all = await db.entries.toArray()
    return all.sort((a, b) => b.createdAt - a.createdAt)
  })

  const filtered = entries
    ? filterEntries(entries, {
        query: filters.query,
        theme: filters.theme,
        level: filters.level,
        verified: filters.verified,
        favoritesOnly: filters.favoritesOnly,
      })
    : undefined

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Ereyada</h1>
        {filtered && (
          <span className="text-xs text-muted tabular-nums">
            {filtered.length} phrase{filtered.length > 1 ? 's' : ''}
          </span>
        )}
      </header>

      <FilterBar
        filters={filters}
        onChange={(f) => {
          setFilters(f)
          setLimit(PAGE_SIZE)
        }}
      />

      <AddEntryForm />

      {filtered === undefined ? (
        <p className="py-8 text-center text-sm text-muted">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {entries && entries.length === 0
            ? 'Base vide. Ajoutez une phrase ci-dessus, ou importez un fichier JSON depuis les réglages.'
            : 'Aucun résultat avec ces filtres.'}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {filtered.slice(0, limit).map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
          {filtered.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="tap rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted"
            >
              Afficher plus ({filtered.length - limit} restantes)
            </button>
          )}
        </>
      )}
    </div>
  )
}
