'use client'

import { useState } from 'react'
import type { Level, Theme } from '@/lib/db/types'
import { LEVEL_LABELS, THEME_LABELS, THEMES } from '@/lib/db/types'
import { getDb } from '@/lib/db/db'
import { addEntry } from '@/lib/db/repo'
import { invalidCharacters } from '@/lib/content/somali'

/**
 * Ajout manuel d'une phrase.
 * La source est obligatoire ; la phrase entre toujours non vérifiée.
 */
export function AddEntryForm({ onAdded }: { onAdded?: () => void }) {
  const [open, setOpen] = useState(false)
  const [somali, setSomali] = useState('')
  const [french, setFrench] = useState('')
  const [theme, setTheme] = useState<Theme>('salutations')
  const [level, setLevel] = useState<Level>(1)
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const badChars = invalidCharacters(somali)
  const valid = somali.trim() && french.trim() && source.trim()

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await addEntry(
        {
          somali,
          french,
          theme,
          level,
          source,
          notes: notes.trim() || undefined,
        },
        getDb(),
      )
      setSomali('')
      setFrench('')
      setNotes('')
      setMessage('Phrase ajoutée (non vérifiée). Trois cartes créées.')
      onAdded?.()
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap w-full rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-sm text-muted"
      >
        + Ajouter une phrase
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Nouvelle phrase</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="tap px-2 text-sm text-muted"
        >
          Fermer
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Somali *</span>
        <textarea
          value={somali}
          onChange={(e) => setSomali(e.target.value)}
          rows={2}
          className="somali rounded-lg border border-border bg-surface-2 px-3 py-2 text-lg outline-none focus:border-accent"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {badChars.length > 0 && (
          <span className="text-xs text-warn">
            Caractères hors alphabet somali : {badChars.join(', ')} — vérifiez la
            transcription.
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Français *</span>
        <textarea
          value={french}
          onChange={(e) => setFrench(e.target.value)}
          rows={2}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Thème</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            className="tap rounded-lg border border-border bg-surface-2 px-3 py-2"
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Niveau</span>
          <select
            value={level}
            onChange={(e) => setLevel(Number(e.target.value) as Level)}
            className="tap rounded-lg border border-border bg-surface-2 px-3 py-2"
          >
            {([1, 2, 3] as const).map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Source * (d’où vient cette phrase ?)</span>
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="ex. : dit par Amina, 12/07/2026"
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Notes (facultatif)</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <button
        type="button"
        disabled={!valid || saving}
        onClick={() => void submit()}
        className="tap rounded-xl bg-accent px-4 py-3 font-semibold text-[#08120f] disabled:opacity-40"
      >
        {saving ? 'Ajout…' : 'Ajouter (non vérifiée)'}
      </button>
      {message && <p className="text-xs text-ok">{message}</p>}
    </div>
  )
}
