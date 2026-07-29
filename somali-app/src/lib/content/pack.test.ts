import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SomaliDB } from '@/lib/db/db'
import { addEntry } from '@/lib/db/repo'
import { importStarterPack, type StarterPack } from './pack'

let db: SomaliDB
let counter = 500

beforeEach(async () => {
  counter += 1
  db = new SomaliDB(`pack-db-${counter}`)
  await db.open()
  // fetch simulé : sert les audios du pack, 404 sur le reste.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/starter/audio/ok.mp3')) {
      return new Response(new Blob([new Uint8Array(2048)], { type: 'audio/mpeg' }))
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
})

const pack: StarterPack = {
  name: 'Pack test',
  license: 'CC BY-NC-ND 3.0',
  attribution: 'source test',
  entries: [
    {
      somali: 'Haye!',
      french: 'Salut !',
      theme: 'salutations',
      source: '50languages leçon 3',
      audio: 'audio/ok.mp3',
      voiceName: '50languages',
    },
    {
      somali: 'Ayeeyo',
      french: 'La grand-mère',
      theme: 'famille',
      source: '50languages leçon 2',
      audio: 'audio/manquant.mp3',
    },
    {
      // sans source → rejetée
      somali: 'Xxx',
      french: 'Yyy',
      theme: 'famille',
      source: '',
    },
  ],
}

describe('importStarterPack', () => {
  it('importe entrées, cartes et audio', async () => {
    const res = await importStarterPack(db, pack)
    expect(res.status).toBe('ok')
    expect(res.added).toBe(2)
    expect(res.rejected).toBe(1)
    expect(res.audioAttached).toBe(1)
    expect(res.audioFailed).toBe(1)

    const entries = await db.entries.toArray()
    expect(entries).toHaveLength(2)
    const haye = entries.find((e) => e.somali === 'Haye!')
    expect(haye?.verified).toBe(false)
    expect(haye?.audioIds).toHaveLength(1)
    expect(haye?.primaryAudioId).toBeDefined()
    expect(await db.cards.count()).toBe(6)

    const asset = await db.audio.get(haye!.primaryAudioId!)
    expect(asset?.voiceName).toBe('50languages')
    expect(asset?.bytes).toBe(2048)
    expect(asset?.entryId).toBe(haye!.id)
  })

  it('est idempotent : un second import ne duplique rien', async () => {
    await importStarterPack(db, pack)
    const second = await importStarterPack(db, pack)
    expect(second.added).toBe(0)
    expect(second.skippedDuplicates).toBe(2)
    expect(await db.entries.count()).toBe(2)
    expect(await db.cards.count()).toBe(6)
    // L'audio n'est pas retéléchargé pour une entrée qui en a déjà.
    expect(second.audioAttached).toBe(0)
    expect(await db.audio.count()).toBe(1)
  })

  it('rattache l’audio à une entrée préexistante sans audio', async () => {
    await addEntry(
      { somali: 'Haye!', french: 'Salut !', theme: 'salutations', source: 'manuel' },
      db,
    )
    const res = await importStarterPack(db, pack)
    expect(res.added).toBe(1) // seulement Ayeeyo
    expect(res.skippedDuplicates).toBe(1)
    const haye = (await db.entries.toArray()).find((e) => e.somali === 'Haye!')
    expect(haye?.audioIds).toHaveLength(1)
    expect(haye?.source).toBe('manuel') // l'entrée existante n'est pas écrasée
  })

  it('force verified à false même si le pack prétend le contraire', async () => {
    const sneaky: StarterPack = {
      ...pack,
      entries: [{ ...pack.entries[0]!, verified: true }],
    }
    await importStarterPack(db, sneaky)
    const entry = (await db.entries.toArray())[0]
    expect(entry?.verified).toBe(false)
  })

  it('signale un pack absent', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 404 })) as typeof fetch
    const res = await importStarterPack(db)
    expect(res.status).toBe('absent')
    expect(await db.entries.count()).toBe(0)
  })
})
