import { DEFAULT_MEDIA_CACHE_LIMITS, planMediaCacheEviction, type MediaCacheEntry } from '@votz/chat-core'
import { webChatStorage } from './chat-storage'

/**
 * Arquivos de conversa já abertos, guardados cifrados (AES-GCM) neste navegador, com limite de espaço: abrir de
 * novo não baixa nem decifra outra vez. O que sai primeiro é o que está há mais tempo sem uso.
 *
 * A chave sai do mesmo segredo automático que já protege as chaves das conversas neste navegador, então a
 * proteção é a mesma delas: cobre quem olha os arquivos do disco, mas não quem tem acesso ao perfil inteiro do
 * navegador. Navegador sem esse segredo (os antigos, com senha própria) fica sem cache.
 */
export interface MediaCache {
  get(id: string): Promise<Uint8Array | null>
  put(id: string, bytes: Uint8Array): Promise<void>
  usage(): Promise<number>
  clear(): Promise<void>
}

/** Dados cifrados de um arquivo. Ficam separados dos metadados para contar o espaço sem carregar os arquivos. */
interface FileRow {
  id: string
  iv: Uint8Array
  data: ArrayBuffer
}

const FILES = 'files'
const META = 'meta'
const databaseName = (userId: string) => `votz-chat-media-${userId}`

function openDatabase(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName(userId), 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(FILES, { keyPath: 'id' })
      request.result.createObjectStore(META, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('bloqueado'))
  })
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`votz-media-cache-v1:${secret}`))
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function createMediaCache(
  userId: string,
  secret: string,
  limitBytes: number = DEFAULT_MEDIA_CACHE_LIMITS.web,
): Promise<MediaCache> {
  const database = await openDatabase(userId)
  const key = await deriveKey(secret)

  /** Roda `work` numa transação e espera ela terminar de verdade (gravar só vale depois do "complete"). */
  const run = <T,>(names: string[], mode: IDBTransactionMode, work: (stores: IDBObjectStore[]) => IDBRequest<T> | void) =>
    new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction(names, mode)
      const request = work(names.map((name) => transaction.objectStore(name)))
      transaction.oncomplete = () => resolve(request ? request.result : undefined)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  const metas = async () => ((await run([META], 'readonly', ([meta]) => meta.getAll() as IDBRequest<MediaCacheEntry[]>)) ?? [])
  const remove = (id: string) =>
    run([FILES, META], 'readwrite', ([files, meta]) => {
      files.delete(id)
      meta.delete(id)
    }).catch(() => undefined)

  return {
    async get(id) {
      try {
        const row = (await run([FILES], 'readonly', ([files]) => files.get(id) as IDBRequest<FileRow | undefined>)) ?? null
        if (!row) return null
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv as BufferSource }, key, row.data)
        // Marca como usado agora: é o que decide quem sai primeiro quando o espaço enche.
        void run([META], 'readwrite', ([meta]) => {
          meta.put({ id, size: plain.byteLength, lastUsedAt: Date.now() } satisfies MediaCacheEntry)
        }).catch(() => undefined)
        return new Uint8Array(plain)
      } catch {
        // Linha ilegível (chave trocada, arquivo corrompido): descarta e baixa de novo.
        await remove(id)
        return null
      }
    },
    async put(id, bytes) {
      try {
        const others = (await metas()).filter((entry) => entry.id !== id)
        const plan = planMediaCacheEviction(others, limitBytes, bytes.byteLength)
        if (!plan.fits) return
        await Promise.all(plan.evict.map(remove))
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes as BufferSource)
        await run([FILES, META], 'readwrite', ([files, meta]) => {
          files.put({ id, iv, data } satisfies FileRow)
          meta.put({ id, size: bytes.byteLength, lastUsedAt: Date.now() } satisfies MediaCacheEntry)
        })
      } catch {
        /* Cache é um extra: sem espaço no navegador, o arquivo só deixa de ficar guardado. */
      }
    },
    async usage() {
      try {
        return (await metas()).reduce((sum, entry) => sum + entry.size, 0)
      } catch {
        return 0
      }
    },
    async clear() {
      await run([FILES, META], 'readwrite', ([files, meta]) => {
        files.clear()
        meta.clear()
      }).catch(() => undefined)
    },
  }
}

const caches = new Map<string, Promise<MediaCache | null>>()

/** Cache deste usuário neste navegador, ou null se não puder ser usado com segurança. */
export function getMediaCache(userId: string): Promise<MediaCache | null> {
  let cache = caches.get(userId)
  if (!cache) {
    cache = (async () => {
      try {
        const storage = await webChatStorage(userId)
        const secret = storage.storeSecret
        storage.close()
        return secret ? await createMediaCache(userId, secret) : null
      } catch {
        return null
      }
    })()
    caches.set(userId, cache)
  }
  return cache
}

/** Esquece o cache em memória (ao sair da conta); o banco do navegador é apagado por `forgetWebChat`. */
export function dropMediaCache(userId: string) {
  caches.delete(userId)
}
