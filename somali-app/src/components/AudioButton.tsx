'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Entry } from '@/lib/db/types'
import { defaultProvider, entryAudioUrl } from '@/lib/audio/provider'

/**
 * Bouton de lecture audio d'une entrée.
 * Gère le cycle objectURL → lecture → libération, et l'état visuel.
 */
export function AudioButton({
  entry,
  size = 'md',
  autoPlay = false,
  onPlayed,
}: {
  entry: Entry
  size?: 'md' | 'lg'
  autoPlay?: boolean
  /** Durée effectivement écoutée (ms), notifiée en fin de lecture. */
  onPlayed?: (ms: number) => void
}) {
  const [playing, setPlaying] = useState(false)
  const [missing, setMissing] = useState(entry.audioIds.length === 0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    setPlaying(false)
  }, [])

  const play = useCallback(async () => {
    stop()
    const url = await entryAudioUrl(entry, defaultProvider())
    if (!url) {
      setMissing(true)
      return
    }
    urlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => {
      onPlayed?.(Math.round(audio.duration * 1000) || 0)
      stop()
    }
    audio.onerror = () => stop()
    setPlaying(true)
    try {
      await audio.play()
    } catch {
      // Lecture refusée (politique d'autoplay) : on rend la main.
      stop()
    }
  }, [entry, onPlayed, stop])

  useEffect(() => stop, [stop])

  useEffect(() => {
    if (autoPlay) void play()
    // Rejoue uniquement quand on change d'entrée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, autoPlay])

  if (missing) {
    return (
      <span className="text-xs text-muted" aria-label="Aucun audio disponible">
        — pas d’audio —
      </span>
    )
  }

  const cls =
    size === 'lg'
      ? 'h-20 w-20 text-3xl'
      : 'h-12 w-12 text-xl'

  return (
    <button
      type="button"
      onClick={() => (playing ? stop() : void play())}
      className={`tap inline-flex items-center justify-center rounded-full border border-accent/60 bg-accent/15 text-accent active:bg-accent/30 ${cls}`}
      aria-label={playing ? 'Arrêter la lecture' : 'Écouter'}
    >
      {playing ? '■' : '▶'}
    </button>
  )
}
