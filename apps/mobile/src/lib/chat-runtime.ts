import {
  ChatClient,
  enrollDevice,
  type ChatEnrollment,
  type ChatHttp,
  type ChatState,
} from '@votz/chat-core'
import { Platform } from 'react-native'
import { uuid } from 'expo-modules-core'
import { api, ApiError, json } from './api'
import { useSession } from './session'
import { NativeChatCrypto } from './chat-crypto'
import { forgetNativeChat, nativeChatStorage } from './chat-storage'

/**
 * HTTP autenticado com as credenciais DESTE aparelho, sem abrir o motor
 * criptográfico. Serve ao gerenciamento de aparelhos conectados.
 */
export async function nativeChatDeviceHttp(userId: string): Promise<ChatHttp> {
  const storage = await nativeChatStorage(userId)
  return (path, method = 'GET', body) => {
    if (useSession.getState().user?.id !== userId)
      return Promise.reject(new ApiError('Sessão encerrada.', 401))
    return api(`/conversations${path}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: {
        'x-votz-chat-device': storage.credentials.id,
        'x-votz-chat-secret': storage.credentials.secret,
      },
    })
  }
}

let previous: { client: ChatClient; engine: NativeChatCrypto } | null = null
let opening: Promise<unknown> = Promise.resolve()
export function openNativeChat(
  userId: string,
  conversationId: string,
  signal: AbortSignal,
  listener: (state: ChatState) => void,
  onClient: (client: ChatClient) => void,
  onPending: (pending: { code: string; expiresAt: string } | null) => void = () => {},
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
    // O primeiro aparelho da conta ativa direto; os demais mostram um código e
    // esperam a aprovação de um aparelho já ativo.
    const session = await enrollDevice(
      () =>
        api<ChatEnrollment>('/conversations/chat/devices', {
          ...json({
            ...storage.credentials,
            label: Platform.OS === 'ios' ? 'Votz no iPhone' : 'Votz no Android',
          }),
          signal,
        }),
      { onPending, signal },
    )
    onPending(null)
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

export { forgetNativeChat }
/**
 * Recomeçar do zero: confirma a senha da conta, desconecta todos os aparelhos
 * e apaga as credenciais locais. A próxima abertura vira o primeiro aparelho.
 */
export async function resetNativeChat(userId: string, password: string) {
  await api('/conversations/chat/devices/reset', json({ password }))
  await forgetNativeChat(userId)
}
