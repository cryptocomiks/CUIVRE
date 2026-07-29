'use client'

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb, type SomaliDB } from '@/lib/db/db'

/** `true` une fois le composant monté côté navigateur. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

/**
 * Requête réactive sur la base locale.
 *
 * IndexedDB n'existe pas pendant le rendu serveur : la requête n'est lancée
 * qu'après le montage. La valeur vaut `undefined` d'ici là, ce qui permet
 * d'afficher un état de chargement.
 */
export function useDb<T>(
  querier: (db: SomaliDB) => Promise<T>,
  deps: unknown[] = [],
): T | undefined {
  const mounted = useMounted()
  return useLiveQuery(
    () => (mounted ? querier(getDb()) : Promise.resolve(undefined)),
    [mounted, ...deps],
  ) as T | undefined
}
