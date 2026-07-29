/**
 * Modèle de données de l'application.
 *
 * Tout est stocké localement (IndexedDB via Dexie). Aucun backend, aucun compte.
 */

/* ------------------------------------------------------------------ */
/* Thèmes et niveaux                                                   */
/* ------------------------------------------------------------------ */

export const THEMES = [
  'salutations',
  'famille',
  'nourriture',
  'marche',
  'telephone',
  'temps',
  'deplacements',
  'sante',
  'politesse',
  'chiffres',
  'questions',
  'expressions',
] as const

export type Theme = (typeof THEMES)[number]

/** Libellés français affichés dans l'interface. */
export const THEME_LABELS: Record<Theme, string> = {
  salutations: 'Salutations',
  famille: 'Famille',
  nourriture: 'Nourriture',
  marche: 'Marché',
  telephone: 'Téléphone',
  temps: 'Temps',
  deplacements: 'Déplacements',
  sante: 'Santé',
  politesse: 'Politesse',
  chiffres: 'Chiffres',
  questions: 'Questions',
  expressions: 'Expressions courantes',
}

export const LEVELS = [1, 2, 3] as const
export type Level = (typeof LEVELS)[number]

export const LEVEL_LABELS: Record<Level, string> = {
  1: 'Débutant',
  2: 'Intermédiaire',
  3: 'Avancé',
}

/* ------------------------------------------------------------------ */
/* Entrées (phrases)                                                   */
/* ------------------------------------------------------------------ */

/**
 * Une entrée = une phrase entière (jamais un mot isolé hors contexte).
 *
 * Le somali s'articule autour de particules (`waa`, `baa`, `ayaa`) qui n'ont
 * pas de sens isolément : l'unité d'apprentissage est donc la phrase.
 */
export interface Entry {
  id: string
  /** Somali, orthographe latine officielle (voyelles longues doublées, c/x/q/dh/kh). */
  somali: string
  /** Traduction française. */
  french: string
  /** Notes libres : registre, remarque grammaticale, variante régionale. */
  notes?: string
  /** Découpage littéral mot à mot, optionnel (aide à la compréhension). */
  literal?: string
  theme: Theme
  level: Level
  /**
   * Référence de la ressource d'où provient l'entrée.
   * Obligatoire : aucune phrase ne doit entrer dans la base sans provenance.
   */
  source: string
  /**
   * `false` tant qu'un locuteur natif n'a pas confirmé la phrase.
   * L'interface affiche un badge sur toute carte non vérifiée.
   */
  verified: boolean
  /** Horodatage de la validation, et par qui. */
  verifiedAt?: number
  verifiedBy?: string
  /** Identifiants des ressources audio rattachées (voir `AudioAsset`). */
  audioIds: string[]
  /** Audio joué par défaut pour cette entrée. */
  primaryAudioId?: string
  tags: string[]
  favorite: boolean
  /** Phonèmes difficiles présents dans la phrase (`c`, `x`, `q`, `kh`, `dh`, …). */
  phonemes: string[]
  /** Champs normalisés (minuscules, sans accents) pour la recherche instantanée. */
  somaliSearch: string
  frenchSearch: string
  createdAt: number
  updatedAt: number
}

/* ------------------------------------------------------------------ */
/* Audio                                                               */
/* ------------------------------------------------------------------ */

export type AudioKind =
  /** Fichier audio importé depuis l'ordinateur ou le téléphone. */
  | 'imported'
  /** Extrait découpé dans un enregistrement long d'un proche. */
  | 'recorded'
  /** Ma propre voix (entraînement à la prononciation). */
  | 'self'
  /** Synthèse vocale (bonus, jamais requis). */
  | 'tts'

export interface AudioAsset {
  id: string
  blob: Blob
  mimeType: string
  /** Taille en octets, dupliquée hors du blob pour le suivi du quota. */
  bytes: number
  durationMs?: number
  kind: AudioKind
  /** « voix de : [nom] » */
  voiceName?: string
  /** Entrée à laquelle cet audio est rattaché. */
  entryId?: string
  /** Enregistrement long dont ce segment est issu, le cas échéant. */
  recordingId?: string
  /** Bornes du segment dans l'enregistrement source (ms). */
  startMs?: number
  endMs?: number
  /** Nom de fichier utilisé à l'export Anki : `[sound:<fileName>]`. */
  fileName: string
  createdAt: number
}

/** Enregistrement long, avant découpage en segments. */
export interface Recording {
  id: string
  name: string
  blob: Blob
  mimeType: string
  bytes: number
  durationMs?: number
  voiceName?: string
  /** `true` une fois le découpage terminé. */
  processed: boolean
  createdAt: number
}

/* ------------------------------------------------------------------ */
/* Cartes de révision                                                  */
/* ------------------------------------------------------------------ */

export const CARD_MODES = ['recognition', 'production', 'listening'] as const
export type CardMode = (typeof CARD_MODES)[number]

export const CARD_MODE_LABELS: Record<CardMode, string> = {
  recognition: 'Reconnaissance',
  production: 'Production',
  listening: 'Écoute pure',
}

export const CARD_MODE_HINTS: Record<CardMode, string> = {
  recognition: 'Somali écrit → sens français',
  production: 'Français → dire la phrase à voix haute',
  listening: 'Audio seul, sans texte → sens',
}

/** États FSRS, redéclarés en local pour ne pas dépendre de l'enum importée. */
export const CARD_STATES = ['New', 'Learning', 'Review', 'Relearning'] as const

/**
 * Une carte = une entrée × un mode.
 * Les champs FSRS sont stockés à plat pour rester lisibles côté Dexie.
 */
export interface Card {
  id: string
  entryId: string
  mode: CardMode
  /** Date de prochaine échéance (indexée). */
  due: Date
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  /** 0 = New, 1 = Learning, 2 = Review, 3 = Relearning. */
  state: number
  last_review?: Date
  /** Carte mise de côté : jamais proposée en session. */
  suspended: boolean
  createdAt: number
}

/** Journal des révisions : sert au rétro-calcul et aux statistiques. */
export interface ReviewLogEntry {
  /** Clé auto-incrémentée. */
  seq?: number
  cardId: string
  entryId: string
  mode: CardMode
  /** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy (0 = Manual). */
  rating: number
  state: number
  due: Date
  stability: number
  difficulty: number
  elapsed_days: number
  last_elapsed_days: number
  scheduled_days: number
  learning_steps: number
  review: Date
  /** Durée passée sur la carte, en millisecondes. */
  durationMs?: number
}

/* ------------------------------------------------------------------ */
/* Prononciation                                                       */
/* ------------------------------------------------------------------ */

/** Taux de réussite par phonème, pour identifier les points faibles. */
export interface PhonemeStat {
  phoneme: string
  attempts: number
  correct: number
  updatedAt: number
}

/* ------------------------------------------------------------------ */
/* Statistiques quotidiennes                                           */
/* ------------------------------------------------------------------ */

export interface DailyStat {
  /** `YYYY-MM-DD` en heure locale. */
  date: string
  reviews: number
  newCards: number
  again: number
  correct: number
  /** Temps d'écoute audio cumulé, en millisecondes. */
  listeningMs: number
  /** Temps de révision cumulé, en millisecondes. */
  studyMs: number
}

/* ------------------------------------------------------------------ */
/* Réglages                                                            */
/* ------------------------------------------------------------------ */

export interface FsrsSettings {
  /** Rétention visée (0,7 – 0,97). Défaut FSRS : 0,9. */
  requestRetention: number
  maximumInterval: number
  /** Les 21 poids du modèle FSRS-6. */
  w: number[]
  enableFuzz: boolean
  enableShortTerm: boolean
  learningSteps: string[]
  relearningSteps: string[]
}

export interface Settings {
  /** Clé fixe : il n'existe qu'un seul enregistrement. */
  key: 'settings'
  /** Plafond de nouvelles cartes par jour. */
  newCardsPerDay: number
  /** 0 = illimité. */
  maxReviewsPerDay: number
  fsrs: FsrsSettings
  /** Modes de carte activés en session. */
  enabledModes: CardMode[]
  theme: 'dark' | 'light' | 'system'
  /** Séparateur d'export Anki. */
  ankiSeparator: 'tab' | 'semicolon' | 'comma'
  /** Fournisseur de synthèse vocale ; `none` par défaut. */
  ttsProvider: 'none' | 'elevenlabs' | 'azure'
  /** Alerte quota quand l'espace utilisé dépasse ce ratio. */
  quotaWarnRatio: number
  updatedAt: number
}

/* ------------------------------------------------------------------ */
/* Format d'import / export en masse                                   */
/* ------------------------------------------------------------------ */

/** Une entrée telle qu'on l'écrit dans un fichier JSON d'import (voir README). */
export interface EntryImport {
  somali: string
  french: string
  notes?: string
  literal?: string
  theme: Theme
  level?: Level
  source: string
  verified?: boolean
  tags?: string[]
  /** Nom du fichier audio à associer, s'il est importé séparément. */
  audioFile?: string
}
