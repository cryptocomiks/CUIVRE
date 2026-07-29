'use client'

import { useEffect } from 'react'
import { getDb } from '@/lib/db/db'
import { getSettings } from '@/lib/db/repo'

/** Applique le thème choisi dans les réglages dès le chargement. */
export function ThemeInit() {
  useEffect(() => {
    void getSettings(getDb()).then((s) => {
      document.documentElement.dataset.theme = s.theme === 'light' ? 'light' : 'dark'
    })
  }, [])
  return null
}
