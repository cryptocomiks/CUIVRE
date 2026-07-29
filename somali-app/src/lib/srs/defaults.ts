import { default_w } from 'ts-fsrs'
import { CARD_MODES } from '@/lib/db/types'
import type { Settings } from '@/lib/db/types'

/**
 * Réglages par défaut.
 *
 * `newCardsPerDay: 10` correspond à la valeur demandée : un plafond bas est
 * préférable en autodidacte, la charge de révision quotidienne suivant
 * mécaniquement le nombre de nouvelles cartes introduites.
 */
export function defaultSettings(now = Date.now()): Settings {
  return {
    key: 'settings',
    newCardsPerDay: 10,
    maxReviewsPerDay: 0,
    fsrs: {
      requestRetention: 0.9,
      maximumInterval: 365 * 5,
      w: [...default_w],
      // Le fuzz désactivé rend la planification reproductible : utile pour
      // les tests et sans inconvénient réel sur une base personnelle.
      enableFuzz: false,
      enableShortTerm: true,
      learningSteps: ['1m', '10m'],
      relearningSteps: ['10m'],
    },
    enabledModes: [...CARD_MODES],
    theme: 'dark',
    ankiSeparator: 'tab',
    ttsProvider: 'none',
    quotaWarnRatio: 0.8,
    updatedAt: now,
  }
}
