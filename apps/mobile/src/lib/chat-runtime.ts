import {
  ChatClient,
  type ChatHttp,
  type ChatSession,
  type ChatState,
} from '@votz/chat-core'
import { uuid } from 'expo-modules-core'
import { api, ApiError, json } from './api'
import { useSession } from './session'
import { NativeChatCrypto } from './chat-crypto'
import { nativeChatStorage } from './chat-storage'

let previous: { client: ChatClient; engine: NativeChatCrypto } | null = null
let opening: Promise<unknown> = Promise.resolve()
export function openNativeChat(
  userId: string,
  conversationId: string,
  signal: AbortSignal,
  listener: (state: ChatState) => void,
  onClient: (client: ChatClient) => void,
) {
  const task = opening.then(async () => {
    if (previous) {
      await previous.client.stop()
      previous.engine.close()
      previous = null
    }
    if (signal.aborted || useSession.getState().user?.id !== userId)
      return () => {}
    const storage = await nativeChatStorage(userId)
    if (signal.aborted) return () => {}
    const session = await api<ChatSession>('/conversations/chat/devices', {
      ...json(storage.credentials),
      signal,
    })
    if (signal.aborted || useSession.getState().user?.id !== userId)
      return () => {}
    const engine = await NativeChatCrypto.open(
      {
        userId: session.matrixUserId,
        deviceId: session.deviceId,
        storePath: storage.storePath,
        storePassphrase: storage.passphrase,
      },
      storage.existing,
    )
    if (signal.aborted) {
      engine.close()
      return () => {}
    }
    const http: ChatHttp = (path, method = 'GET', body) => {
      if (signal.aborted || useSession.getState().user?.id !== userId)
        return Promise.reject(new ApiError('Sessão encerrada.', 401))
      return api(`/conversations${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        headers: {
          'x-votz-chat-device': storage.credentials.id,
          'x-votz-chat-secret': storage.credentials.secret,
        },
        signal,
      })
    }
    const client = new ChatClient(
      conversationId,
      session,
      engine,
      http,
      storage.storage,
      () => uuid.v4(),
    )
    const unsubscribe = client.subscribe(listener)
    previous = { client, engine }
    onClient(client)
    void client.start()
    return () => {
      unsubscribe()
      void client.stop().then(() => {
        engine.close()
        if (previous?.client === client) previous = null
      })
    }
  })
  opening = task.catch(() => {})
  return task
}
