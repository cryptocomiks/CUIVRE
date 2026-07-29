import type { AudioAsset, Entry } from '@/lib/db/types'
import type { SomaliDB } from '@/lib/db/db'
import { getDb } from '@/lib/db/db'

/**
 * Abstraction de la source audio d'une entrée.
 *
 * L'application ne dépend d'aucune synthèse vocale : les implémentations
 * locales (fichiers importés, enregistrements de proches) sont les seules
 * requises. Un éventuel `TTSProvider` viendra s'ajouter en phase 3, après
 * vérification du support réel du somali — il restera optionnel.
 */
export interface AudioProvider {
  /** Nom affichable, pour le débogage et les réglages. */
  readonly name: string
  /** Ressource audio pour une entrée, ou `null` si ce fournisseur n'en a pas. */
  assetFor(entry: Entry): Promise<AudioAsset | null>
}

/** Retrouve l'audio « principal » d'une entrée parmi ses ressources. */
async function pickAsset(
  entry: Entry,
  db: SomaliDB,
  filter?: (a: AudioAsset) => boolean,
): Promise<AudioAsset | null> {
  const ids = entry.primaryAudioId
    ? [entry.primaryAudioId, ...entry.audioIds.filter((id) => id !== entry.primaryAudioId)]
    : entry.audioIds
  for (const id of ids) {
    const asset = await db.audio.get(id)
    if (asset && (!filter || filter(asset))) return asset
  }
  return null
}

/**
 * Implémentation par défaut : n'importe quel fichier audio rattaché à
 * l'entrée (importé, découpé, etc.), l'audio principal d'abord.
 */
export class LocalFileProvider implements AudioProvider {
  readonly name = 'local'
  constructor(private readonly db: SomaliDB = getDb()) {}

  assetFor(entry: Entry): Promise<AudioAsset | null> {
    return pickAsset(entry, this.db)
  }
}

/** Restreint aux enregistrements de proches (segments découpés). */
export class RecordedProvider implements AudioProvider {
  readonly name = 'recorded'
  constructor(private readonly db: SomaliDB = getDb()) {}

  assetFor(entry: Entry): Promise<AudioAsset | null> {
    return pickAsset(entry, this.db, (a) => a.kind === 'recorded')
  }
}

/** Essaie plusieurs fournisseurs dans l'ordre, s'arrête au premier qui répond. */
export class ChainProvider implements AudioProvider {
  readonly name: string
  constructor(private readonly providers: AudioProvider[]) {
    this.name = providers.map((p) => p.name).join('>')
  }

  async assetFor(entry: Entry): Promise<AudioAsset | null> {
    for (const p of this.providers) {
      const asset = await p.assetFor(entry)
      if (asset) return asset
    }
    return null
  }
}

/** Chaîne par défaut de l'application : enregistrements de proches, puis tout fichier local. */
export function defaultProvider(db: SomaliDB = getDb()): AudioProvider {
  return new ChainProvider([new RecordedProvider(db), new LocalFileProvider(db)])
}

/**
 * URL jouable pour une entrée.
 * L'appelant doit libérer l'URL via `URL.revokeObjectURL` après lecture.
 */
export async function entryAudioUrl(
  entry: Entry,
  provider: AudioProvider = defaultProvider(),
): Promise<string | null> {
  const asset = await provider.assetFor(entry)
  return asset ? URL.createObjectURL(asset.blob) : null
}
