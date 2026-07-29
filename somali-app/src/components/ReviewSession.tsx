'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Card, Entry } from '@/lib/db/types'
import { CARD_MODE_LABELS } from '@/lib/db/types'
import { getDb } from '@/lib/db/db'
import { recordReview, undoReview } from '@/lib/db/repo'
import {
  buildScheduler,
  previewGrades,
  rateCard,
  Rating,
  type Grade,
  type GradePreview,
} from '@/lib/srs/engine'
import { loadSession, shouldRequeue, type SessionData } from '@/lib/srs/session'
import type { FSRS } from 'ts-fsrs'
import { AudioButton } from './AudioButton'
import { UnverifiedBadge } from './Badge'

type Phase = 'loading' | 'empty' | 'active' | 'done'

interface UndoInfo {
  prevCard: Card
  seq: number
  log: Parameters<typeof undoReview>[2]
  wasNew: boolean
  prevQueue: Card[]
  prevIndex: number
  prevDone: number
}

const GRADE_STYLE: Record<Grade, string> = {
  [Rating.Again]: 'border-danger/60 bg-danger/10 text-danger',
  [Rating.Hard]: 'border-warn/60 bg-warn/10 text-warn',
  [Rating.Good]: 'border-accent/60 bg-accent/10 text-accent',
  [Rating.Easy]: 'border-ok/60 bg-ok/10 text-ok',
}

export function ReviewSession() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<SessionData | null>(null)
  const [queue, setQueue] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [doneCount, setDoneCount] = useState(0)
  const [againCount, setAgainCount] = useState(0)
  const [undo, setUndo] = useState<UndoInfo | null>(null)

  const schedulerRef = useRef<FSRS | null>(null)
  const cardShownAt = useRef<number>(Date.now())

  useEffect(() => {
    let cancelled = false
    void loadSession(getDb()).then((data) => {
      if (cancelled) return
      schedulerRef.current = buildScheduler(data.settings.fsrs)
      setSession(data)
      setQueue(data.queue)
      setPhase(data.queue.length === 0 ? 'empty' : 'active')
      cardShownAt.current = Date.now()
    })
    return () => {
      cancelled = true
    }
  }, [])

  const card = queue[index]
  const entry = card ? session?.entries.get(card.entryId) : undefined
  const scheduler = schedulerRef.current

  const grade = useCallback(
    async (g: Grade) => {
      if (!card || !scheduler) return
      const now = new Date()
      const durationMs = Math.min(Date.now() - cardShownAt.current, 5 * 60_000)
      const wasNew = card.state === 0
      const res = rateCard(scheduler, card, g, now, durationMs)
      const seq = await recordReview(res.card, res.log, wasNew, getDb())

      setUndo({
        prevCard: card,
        seq,
        log: res.log,
        wasNew,
        prevQueue: queue,
        prevIndex: index,
        prevDone: doneCount,
      })

      const nextQueue = shouldRequeue(res.card, now) ? [...queue, res.card] : queue
      const nextIndex = index + 1

      setQueue(nextQueue)
      setDoneCount((n) => n + 1)
      if (g === Rating.Again) setAgainCount((n) => n + 1)
      setRevealed(false)
      cardShownAt.current = Date.now()

      if (nextIndex >= nextQueue.length) setPhase('done')
      setIndex(nextIndex)
    },
    [card, scheduler, queue, index, doneCount],
  )

  const handleUndo = useCallback(async () => {
    if (!undo) return
    await undoReview(undo.prevCard, undo.seq, undo.log, undo.wasNew, getDb())
    setQueue(undo.prevQueue)
    setIndex(undo.prevIndex)
    setDoneCount(undo.prevDone)
    if (undo.log.rating === Rating.Again) setAgainCount((n) => Math.max(0, n - 1))
    setRevealed(false)
    setUndo(null)
    setPhase('active')
    cardShownAt.current = Date.now()
  }, [undo])

  /* ---------------------------------------------------------------- */

  if (phase === 'loading') {
    return <p className="py-16 text-center text-muted">Préparation de la session…</p>
  }

  if (phase === 'empty') {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-4xl">✓</p>
        <h2 className="text-lg font-semibold">Rien à réviser pour le moment</h2>
        <p className="max-w-xs text-sm text-muted">
          Toutes les cartes échues sont faites et le plafond de nouvelles cartes du
          jour est atteint — ou la base est vide.
        </p>
        <Link href="/repertoire" className="tap rounded-xl border border-border bg-surface px-6 py-3 text-sm">
          Ouvrir le répertoire
        </Link>
      </div>
    )
  }

  if (phase === 'done' || !card || !entry) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-4xl">🎉</p>
        <h2 className="text-lg font-semibold">Session terminée</h2>
        <p className="text-sm text-muted">
          {doneCount} carte{doneCount > 1 ? 's' : ''} révisée{doneCount > 1 ? 's' : ''}
          {againCount > 0 ? ` — ${againCount} à retravailler` : ' — sans faute !'}
        </p>
        {undo && (
          <button
            type="button"
            onClick={() => void handleUndo()}
            className="tap rounded-xl border border-border bg-surface px-6 py-3 text-sm text-muted"
          >
            ↩ Annuler la dernière note
          </button>
        )}
        <Link
          href="/"
          className="tap rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-[#08120f]"
        >
          Retour à l’accueil
        </Link>
      </div>
    )
  }

  const remaining = queue.length - index
  const previews = scheduler ? previewGrades(scheduler, card) : []

  return (
    <div className="flex min-h-[70dvh] flex-col">
      {/* Barre d'état */}
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {CARD_MODE_LABELS[card.mode]}
          {card.state === 0 && <span className="ml-2 text-accent">nouvelle</span>}
        </span>
        <span className="tabular-nums">{remaining} restante{remaining > 1 ? 's' : ''}</span>
      </div>

      {/* Carte */}
      <div className="mt-3 flex flex-1 flex-col rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          {!entry.verified ? <UnverifiedBadge /> : <span />}
          {undo && (
            <button
              type="button"
              onClick={() => void handleUndo()}
              className="tap rounded-lg px-3 py-1 text-xs text-muted"
            >
              ↩ Annuler
            </button>
          )}
        </div>

        <CardFace entry={entry} mode={card.mode} revealed={revealed} />
      </div>

      {/* Zone d'action, à hauteur de pouce */}
      <div className="mt-4">
        {!revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="tap w-full rounded-xl bg-accent py-5 text-base font-semibold text-[#08120f]"
          >
            Afficher la réponse
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {previews.map((p: GradePreview) => (
              <button
                key={p.grade}
                type="button"
                onClick={() => void grade(p.grade)}
                className={`tap flex flex-col items-center rounded-xl border px-1 py-3 ${GRADE_STYLE[p.grade]}`}
              >
                <span className="text-sm font-semibold leading-tight">{p.label}</span>
                <span className="mt-1 text-[11px] opacity-80">{p.interval}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function CardFace({
  entry,
  mode,
  revealed,
}: {
  entry: Entry
  mode: Card['mode']
  revealed: boolean
}) {
  if (mode === 'recognition') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <p className="somali text-3xl leading-snug">{entry.somali}</p>
        {revealed && (
          <>
            <hr className="w-16 border-border" />
            <p className="text-xl">{entry.french}</p>
            <EntryExtras entry={entry} />
            {entry.audioIds.length > 0 && <AudioButton entry={entry} />}
          </>
        )}
      </div>
    )
  }

  if (mode === 'production') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <p className="text-xl">{entry.french}</p>
        {!revealed ? (
          <p className="text-sm text-muted">Dites la phrase à voix haute, puis comparez.</p>
        ) : (
          <>
            <hr className="w-16 border-border" />
            <p className="somali text-3xl leading-snug">{entry.somali}</p>
            <EntryExtras entry={entry} />
            {entry.audioIds.length > 0 && (
              <div className="flex flex-col items-center gap-2">
                <AudioButton entry={entry} autoPlay />
                <p className="text-xs text-muted">Comparez avec l’audio de référence.</p>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // Écoute pure : l'audio d'abord, aucun texte avant révélation.
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <AudioButton entry={entry} size="lg" autoPlay />
      {!revealed ? (
        <p className="text-sm text-muted">Réécoutez autant que nécessaire.</p>
      ) : (
        <>
          <hr className="w-16 border-border" />
          <p className="somali text-2xl leading-snug">{entry.somali}</p>
          <p className="text-lg">{entry.french}</p>
          <EntryExtras entry={entry} />
        </>
      )}
    </div>
  )
}

function EntryExtras({ entry }: { entry: Entry }) {
  if (!entry.literal && !entry.notes) return null
  return (
    <div className="flex flex-col gap-1 text-sm text-muted">
      {entry.literal && <p>littéral : {entry.literal}</p>}
      {entry.notes && <p>{entry.notes}</p>}
    </div>
  )
}
