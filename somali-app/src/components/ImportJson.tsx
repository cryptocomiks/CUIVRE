'use client'

import { useRef, useState } from 'react'
import { getDb } from '@/lib/db/db'
import { importEntries, type ImportReport } from '@/lib/db/repo'

/** Import en masse depuis un fichier JSON (format documenté dans le README). */
export function ImportJson() {
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const runImport = async (text: string) => {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const parsed: unknown = JSON.parse(text)
      if (!Array.isArray(parsed)) {
        setError('Le fichier doit contenir un tableau JSON : [ { … }, { … } ].')
        return
      }
      setReport(await importEntries(parsed, getDb()))
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? `JSON invalide : ${e.message}`
          : 'Import impossible — fichier illisible.',
      )
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    await runImport(await file.text())
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Import en masse (JSON)</h2>
      <p className="text-xs text-muted">
        Tableau d’objets avec au minimum <code>somali</code>, <code>french</code>,{' '}
        <code>theme</code> et <code>source</code>. Format complet dans le README. Les
        doublons sont ignorés, tout entre « non vérifié ».
      </p>

      <label className="tap flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-surface-2 px-4 py-4 text-sm text-muted">
        {busy ? 'Import en cours…' : 'Choisir un fichier .json'}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      {report && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <span className="font-semibold text-ok">{report.added} ajoutée(s)</span>
            {report.skipped > 0 && (
              <span className="text-muted"> · {report.skipped} écartée(s)</span>
            )}
          </p>
          {report.issues.length > 0 && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg bg-surface-2 p-3 text-xs">
              {report.issues.slice(0, 30).map((issue, i) => (
                <li
                  key={i}
                  className={issue.severity === 'error' ? 'text-danger' : 'text-warn'}
                >
                  ligne {issue.index + 1} : {issue.message}
                </li>
              ))}
              {report.issues.length > 30 && (
                <li className="text-muted">… et {report.issues.length - 30} de plus</li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
