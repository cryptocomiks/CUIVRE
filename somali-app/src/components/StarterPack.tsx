'use client'

import { useEffect, useState } from 'react'
import { getDb } from '@/lib/db/db'
import {
  fetchPack,
  importStarterPack,
  type PackImportResult,
  type StarterPack,
} from '@/lib/content/pack'

/**
 * Chargement du pack de départ (phrases + audio) s'il est présent sur ce
 * déploiement — voir scripts/fetch-50languages.mjs et le README.
 */
export function StarterPackCard() {
  const [pack, setPack] = useState<StarterPack | null | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PackImportResult | null>(null)

  useEffect(() => {
    void fetchPack().then(setPack)
  }, [])

  if (pack === 'loading') return null

  if (pack === null) {
    return (
      <section className="rounded-xl border border-border bg-surface p-4 text-sm">
        <h2 className="mb-1 font-semibold">Pack de départ (audio)</h2>
        <p className="text-muted">
          Aucun pack n’est installé sur ce déploiement. Pour en générer un avec de
          l’audio somali gratuit, lancez sur votre machine :
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">
          node scripts/fetch-50languages.mjs
        </pre>
        <p className="mt-2 text-xs text-muted">
          Détails, sources alternatives et licences : section « Audio gratuit » du
          README.
        </p>
      </section>
    )
  }

  const run = async () => {
    setBusy(true)
    try {
      setResult(await importStarterPack(getDb(), pack))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm">
      <div>
        <h2 className="font-semibold">Pack de départ disponible</h2>
        <p className="mt-1 text-muted">
          « {pack.name} » — {pack.entries.length} phrases avec audio.
        </p>
        <p className="mt-1 text-xs text-muted">
          {pack.attribution} · {pack.license}
        </p>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="tap rounded-xl bg-accent px-4 py-3 font-semibold text-[#08120f] disabled:opacity-40"
      >
        {busy ? 'Import en cours…' : 'Charger le pack de départ'}
      </button>

      {result && (
        <div className="flex flex-col gap-1 text-xs">
          <p className="text-ok">
            {result.added} phrase(s) ajoutée(s), {result.audioAttached} audio(s)
            rattaché(s).
          </p>
          {result.skippedDuplicates > 0 && (
            <p className="text-muted">{result.skippedDuplicates} déjà présente(s).</p>
          )}
          {(result.rejected > 0 || result.audioFailed > 0) && (
            <p className="text-warn">
              {result.rejected} rejetée(s), {result.audioFailed} audio(s) introuvable(s).
            </p>
          )}
          <p className="mt-1 text-muted">
            Toutes les phrases arrivent « non vérifiées » : faites-les confirmer par un
            locuteur natif, puis validez-les dans Ereyada.
          </p>
        </div>
      )}
    </section>
  )
}
