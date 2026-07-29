import Dexie, { type Table } from 'dexie'
import type {
  AudioAsset,
  Card,
  DailyStat,
  Entry,
  PhonemeStat,
  Recording,
  ReviewLogEntry,
  Settings,
} from './types'

/**
 * Base locale de l'application.
 *
 * Remarque sur les index : IndexedDB ne sait pas indexer les booléens.
 * Les champs `verified`, `favorite` et `suspended` restent donc de simples
 * propriétés filtrées en mémoire — le volume (quelques milliers d'entrées)
 * rend cela sans conséquence.
 */
export class SomaliDB extends Dexie {
  entries!: Table<Entry, string>
  cards!: Table<Card, string>
  reviewLogs!: Table<ReviewLogEntry, number>
  audio!: Table<AudioAsset, string>
  recordings!: Table<Recording, string>
  phonemeStats!: Table<PhonemeStat, string>
  dailyStats!: Table<DailyStat, string>
  settings!: Table<Settings, string>

  constructor(name = 'af-soomaali') {
    super(name)
    this.version(1).stores({
      entries: 'id, theme, level, updatedAt, createdAt, *tags, *phonemes',
      cards: 'id, entryId, mode, due, state, [entryId+mode]',
      reviewLogs: '++seq, cardId, entryId, review, mode',
      audio: 'id, entryId, kind, voiceName, recordingId, createdAt',
      recordings: 'id, voiceName, createdAt',
      phonemeStats: 'phoneme',
      dailyStats: 'date',
      settings: 'key',
    })
  }
}

/**
 * Instance partagée.
 *
 * Elle n'est créée qu'une fois : sur le serveur (rendu Next.js), Dexie
 * fonctionne en mode dégradé sans `indexedDB` — aucun accès n'est fait au
 * niveau du module, uniquement dans les composants clients.
 */
let instance: SomaliDB | null = null

export function getDb(): SomaliDB {
  if (!instance) instance = new SomaliDB()
  return instance
}

/** Réservé aux tests : remplace l'instance partagée. */
export function setDb(next: SomaliDB | null): void {
  instance = next
}
