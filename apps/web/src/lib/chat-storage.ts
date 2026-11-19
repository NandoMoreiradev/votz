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
    const random = () =>
      [...crypto.getRandomValues(new Uint8Array(48))]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    request.onsuccess = () => {
      value = request.result
      if (!value) {
        value = { id: crypto.randomUUID(), secret: random(), platform: 'web' }
        store.put(value, 'credentials')
        // Navegador novo: um segredo gerado aqui protege as chaves guardadas,
        // sem a pessoa precisar criar nem lembrar de senha. Navegadores que já
        // usavam uma senha própria não têm esta entrada e seguem como antes.
        store.put(random(), 'storeSecret')
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
    /** Segredo automático das chaves; ausente em navegadores antigos que usam senha própria. */
    storeSecret: await read<string>('storeSecret'),
    initialized: !!(await read<boolean>('initialized')),
    markInitialized: () => write('initialized', true),
    close: () => database.close(),
  }
}

/**
 * Apaga tudo o que este navegador guarda das conversas deste usuário
 * (credenciais, fila e chaves). Usado quando o aparelho foi desconectado ou
 * na redefinição: a próxima abertura recomeça como a primeira vez.
 */
export async function forgetWebChat(userId: string) {
  const known = (await indexedDB.databases?.()) || []
  const names = known
    .map((database) => database.name)
    .filter(
      (name): name is string =>
        !!name &&
        (name === `votz-chat-${userId}` ||
          name.startsWith(`votz-keys-${userId}-`)),
    )
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name)
          request.onsuccess = request.onerror = request.onblocked = () =>
            resolve()
        }),
    ),
  )
}
