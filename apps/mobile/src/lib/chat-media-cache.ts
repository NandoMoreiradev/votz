import { DEFAULT_MEDIA_CACHE_LIMITS, planMediaCacheEviction, type MediaCacheEntry } from '@votz/chat-core'

/**
 * Arquivos de conversa já baixados, guardados no aparelho com limite de espaço: abrir de novo não baixa outra vez.
 *
 * O que vai para o disco é o arquivo CIFRADO, do jeito que o servidor guarda. A chave dele existe só dentro da
 * mensagem (que neste app fica apenas na memória), então nada de legível nem chave fica gravado ao lado: para
 * abrir, o app decifra com a chave da mensagem que está na tela. O que sai primeiro é o mais tempo sem uso.
 */
export interface MediaCache {
  /** Arquivo cifrado guardado, ou null. */
  get(id: string): Promise<Uint8Array | null>
  put(id: string, cipher: Uint8Array): Promise<void>
  /** Descarta um arquivo guardado que não abriu (corrompido). */
  remove(id: string): Promise<void>
  usage(): Promise<number>
  clear(): Promise<void>
}

/** Operações de arquivo que o cache precisa: no app vêm do `expo-file-system`, nos testes de uma memória. */
export interface MediaFileStore {
  read(name: string): Promise<Uint8Array | null>
  write(name: string, bytes: Uint8Array): Promise<void>
  remove(name: string): Promise<void>
  removeAll(): Promise<void>
}

type Index = Record<string, { size: number; lastUsedAt: number }>

const INDEX_FILE = 'index.json'
/** Id de anexo é UUID: nada além disso vira nome de arquivo. */
const SAFE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fileNameOf = (id: string) => `${id}.bin`

export function createMediaCache(
  store: MediaFileStore,
  limitBytes: number = DEFAULT_MEDIA_CACHE_LIMITS.mobile,
  now: () => number = Date.now,
): MediaCache {
  // Uma operação por vez: duas gravações juntas do índice perderiam entradas.
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work)
    chain = next.catch(() => undefined)
    return next
  }

  async function readIndex(): Promise<Index> {
    try {
      const bytes = await store.read(INDEX_FILE)
      if (!bytes) return {}
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Index
      const clean: Index = {}
      for (const [id, entry] of Object.entries(parsed ?? {}))
        if (SAFE_ID.test(id) && entry && Number.isFinite(entry.size) && Number.isFinite(entry.lastUsedAt))
          clean[id] = { size: entry.size, lastUsedAt: entry.lastUsedAt }
      return clean
    } catch {
      // Índice estragado: recomeça vazio (os arquivos soltos são apagados quando o espaço for usado).
      return {}
    }
  }
  const writeIndex = (index: Index) => store.write(INDEX_FILE, new TextEncoder().encode(JSON.stringify(index)))
  const entriesOf = (index: Index): MediaCacheEntry[] =>
    Object.entries(index).map(([id, entry]) => ({ id, size: entry.size, lastUsedAt: entry.lastUsedAt }))

  return {
    get: (id) =>
      serial(async () => {
        if (!SAFE_ID.test(id)) return null
        const index = await readIndex()
        if (!index[id]) return null
        const bytes = await store.read(fileNameOf(id)).catch(() => null)
        if (!bytes) {
          delete index[id]
          await writeIndex(index).catch(() => undefined)
          return null
        }
        index[id] = { size: bytes.byteLength, lastUsedAt: now() }
        await writeIndex(index).catch(() => undefined)
        return bytes
      }),
    put: (id, cipher) =>
      serial(async () => {
        if (!SAFE_ID.test(id)) return
        try {
          const index = await readIndex()
          delete index[id]
          const plan = planMediaCacheEviction(entriesOf(index), limitBytes, cipher.byteLength)
          if (!plan.fits) return
          for (const evicted of plan.evict) {
            delete index[evicted]
            await store.remove(fileNameOf(evicted)).catch(() => undefined)
          }
          await store.write(fileNameOf(id), cipher)
          index[id] = { size: cipher.byteLength, lastUsedAt: now() }
          await writeIndex(index)
        } catch {
          /* Cache é um extra: sem espaço ou erro de disco, o arquivo só deixa de ficar guardado. */
        }
      }),
    remove: (id) =>
      serial(async () => {
        if (!SAFE_ID.test(id)) return
        const index = await readIndex()
        delete index[id]
        await store.remove(fileNameOf(id)).catch(() => undefined)
        await writeIndex(index).catch(() => undefined)
      }),
    usage: () =>
      serial(async () => entriesOf(await readIndex()).reduce((sum, entry) => sum + entry.size, 0)),
    clear: () =>
      serial(async () => {
        await store.removeAll().catch(() => undefined)
      }),
  }
}

/** Guarda os arquivos em `documentos/chat/<usuário>/media`: a pasta some junto com o resto ao sair da conta. */
async function expoFileStore(userId: string): Promise<MediaFileStore> {
  const { Directory, File, Paths } = await import('expo-file-system')
  const directory = new Directory(Paths.document, 'chat', userId, 'media')
  const ensure = () => {
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true })
  }
  return {
    async read(name) {
      const file = new File(directory, name)
      return file.exists ? file.bytes() : null
    },
    async write(name, bytes) {
      ensure()
      const file = new File(directory, name)
      if (file.exists) file.delete()
      file.write(bytes)
    },
    async remove(name) {
      const file = new File(directory, name)
      if (file.exists) file.delete()
    },
    async removeAll() {
      if (directory.exists) directory.delete()
    },
  }
}

const caches = new Map<string, MediaCache>()

/** Cache deste usuário neste aparelho. */
export function getNativeMediaCache(userId: string): MediaCache {
  let cache = caches.get(userId)
  if (!cache) {
    // O adaptador carrega o módulo de arquivos só na primeira vez que o cache é usado.
    let store: Promise<MediaFileStore> | null = null
    const lazy: MediaFileStore = {
      read: async (name) => (await (store ??= expoFileStore(userId))).read(name),
      write: async (name, bytes) => (await (store ??= expoFileStore(userId))).write(name, bytes),
      remove: async (name) => (await (store ??= expoFileStore(userId))).remove(name),
      removeAll: async () => (await (store ??= expoFileStore(userId))).removeAll(),
    }
    cache = createMediaCache(lazy)
    caches.set(userId, cache)
  }
  return cache
}

/** Esquece o cache em memória (ao sair da conta); a pasta é apagada por `forgetNativeChat`. */
export function dropNativeMediaCache(userId: string) {
  caches.delete(userId)
}
