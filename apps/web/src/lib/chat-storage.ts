import type {
  ChatCredentials,
  ChatStorage,
  ChatTransportState,
} from '@votz/chat-core'

type TransportState = ChatTransportState
function open(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`votz-chat-${userId}`, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('state')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(
        new Error('O navegador não conseguiu abrir o armazenamento protegido.'),
      )
    request.onblocked = () =>
      reject(new Error('Feche outras abas do mensageiro e tente novamente.'))
  })
}
export async function webChatStorage(userId: string) {
  const database = await open(userId)
  const read = <T>(key: string): Promise<T | undefined> =>
    new Promise((resolve, reject) => {
      const request = database
        .transaction('state', 'readonly')
        .objectStore('state')
        .get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  const write = (key: string, value: unknown): Promise<void> =>
    new Promise((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite')
      transaction.objectStore('state').put(value, key)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  // One read/write transaction prevents StrictMode or concurrent tabs from
  // overwriting a newly created device identity with a second random identity.
  const credentials = await new Promise<ChatCredentials>((resolve, reject) => {
    const transaction = database.transaction('state', 'readwrite')
    const store = transaction.objectStore('state')
    const request = store.get('credentials')
    let value: ChatCredentials
    request.onsuccess = () => {
      value = request.result
      if (!value) {
        const bytes = crypto.getRandomValues(new Uint8Array(48))
        value = {
          id: crypto.randomUUID(),
          secret: [...bytes]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(''),
          platform: 'web',
        }
        store.put(value, 'credentials')
      }
    }
    transaction.oncomplete = () => resolve(value)
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
  const storage: ChatStorage = {
    load: async () =>
      (await read<TransportState>('transport')) || { pending: [] },
    save: (value) => write('transport', value),
  }
  return {
    credentials,
    storage,
    initialized: !!(await read<boolean>('initialized')),
    markInitialized: () => write('initialized', true),
    close: () => database.close(),
  }
}
