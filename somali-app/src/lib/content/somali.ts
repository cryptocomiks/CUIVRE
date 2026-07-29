/**
 * Utilitaires liés à l'orthographe latine officielle du somali.
 *
 * Alphabet somali (Farmaajo, 1972) : 21 consonnes + 5 voyelles.
 * Les voyelles longues s'écrivent doublées : aa, ee, ii, oo, uu.
 * Les digrammes `dh` et `kh` sont des consonnes à part entière : ils ne
 * doivent jamais être scindés lors de l'analyse.
 */

/** Digrammes à traiter comme une unité, dans l'ordre de priorité. */
export const DIGRAPHS = ['dh', 'kh', 'sh'] as const

/** Consonnes absentes du français, cœur du module Dhawaaq. */
export const HARD_PHONEMES = ['c', 'x', 'q', 'kh', 'dh'] as const
export type HardPhoneme = (typeof HARD_PHONEMES)[number]

/** Voyelles longues, seconde grande difficulté pour un francophone. */
export const LONG_VOWELS = ['aa', 'ee', 'ii', 'oo', 'uu'] as const
export const SHORT_VOWELS = ['a', 'e', 'i', 'o', 'u'] as const

/**
 * Étiquettes affichées pour les phonèmes suivis.
 * Les voyelles longues sont regroupées sous la clé `long-vowel`.
 */
export const PHONEME_LABELS: Record<string, string> = {
  c: 'c (ʿayn)',
  x: 'x (ḥ pharyngal)',
  q: 'q (occlusive uvulaire)',
  kh: 'kh (fricative vélaire)',
  dh: 'dh (rétroflexe)',
  'long-vowel': 'voyelles longues',
}

/** Retire les diacritiques et passe en minuscules, pour la recherche. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Découpe un mot somali en unités graphémiques, en gardant `dh`, `kh`, `sh`
 * et les voyelles longues intactes.
 */
export function graphemes(word: string): string[] {
  const lower = word.toLowerCase()
  const out: string[] = []
  let i = 0
  while (i < lower.length) {
    const pair = lower.slice(i, i + 2)
    if (
      (DIGRAPHS as readonly string[]).includes(pair) ||
      (LONG_VOWELS as readonly string[]).includes(pair)
    ) {
      out.push(pair)
      i += 2
      continue
    }
    out.push(lower[i] as string)
    i += 1
  }
  return out
}

/**
 * Liste les phonèmes difficiles présents dans une phrase.
 * Sert à alimenter le suivi de réussite par phonème.
 */
export function detectPhonemes(somali: string): string[] {
  const found = new Set<string>()
  for (const word of somali.split(/\s+/)) {
    for (const g of graphemes(word)) {
      if ((HARD_PHONEMES as readonly string[]).includes(g)) found.add(g)
      else if ((LONG_VOWELS as readonly string[]).includes(g)) found.add('long-vowel')
    }
  }
  return [...found].sort()
}

/**
 * Signale les caractères qui n'appartiennent pas à l'orthographe officielle.
 * Utilisé à l'import pour repérer un texte mal transcrit (p, v, z, ñ, é…).
 */
const ALLOWED = new Set('abcdefghijklmnoqrstuwxy\''.split(''))

export function invalidCharacters(somali: string): string[] {
  const bad = new Set<string>()
  for (const ch of somali.toLowerCase()) {
    if (ch === ' ' || ch === '-' || /[.,!?;:]/.test(ch)) continue
    if (!ALLOWED.has(ch)) bad.add(ch)
  }
  return [...bad]
}
