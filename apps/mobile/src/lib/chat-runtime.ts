import {
  ChatClient,
  enrollDevice,
  type ChatEnrollment,
  type ChatHttp,
  type ChatPendingLink,
  type ChatState,
} from '@votz/chat-core'
import { Platform } from 'react-native'
import { uuid } from 'expo-modules-core'
import { API_URL, api, ApiError, conversationSocketToken, json, uploadFile } from './api'
import { useSession } from './session'
import { NativeChatCrypto } from './chat-crypto'
import { clearChatPushToken, registerChatPushToken } from './chat-push'
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
  onPending: (pending: ChatPendingLink | null) => void = () => {},
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
    void registerChatPushToken(userId)
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
  await clearChatPushToken(userId)
  await forgetNativeChat(userId)
}

/**
 * Sobe bytes já cifrados de ponta a ponta (nunca envia mídia em claro). Os bytes vão para um arquivo
 * temporário e saem dele em streaming (uploadFile): o fetch global do Expo 58 não aceita o anexo
 * { uri, name, type } e, com Blob, carregaria tudo na memória.
 */
export async function uploadNativeChatMedia(
  userId: string,
  conversationId: string,
  ciphertext: Uint8Array,
  signal?: AbortSignal,
  /** Tipo do anexo (image, video, audio, file): a API guarda só para a tela "Gerenciar armazenamento". */
  kind?: string,
): Promise<{ id: string }> {
  const { File, Paths } = await import('expo-file-system')
  const storage = await nativeChatStorage(userId)
  const temp = new File(Paths.cache, `votz-enc-${uuid.v4()}.bin`)
  try {
    temp.write(ciphertext)
    // O token de acesso é renovado pelo uploadFile (e refeito em 401); a API usa o aparelho do chat para autorizar.
    return await uploadFile<{ id: string }>(
      `/conversations/${conversationId}/chat/media`,
      { uri: temp.uri, mimeType: 'application/octet-stream' },
      {
        timeoutMs: 5 * 60_000,
        signal,
        ...(kind ? { parameters: { kind: kind.toUpperCase() } } : {}),
        headers: {
          'x-votz-chat-device': storage.credentials.id,
          'x-votz-chat-secret': storage.credentials.secret,
        },
      },
    )
  } finally {
    try {
      if (temp.exists) temp.delete()
    } catch {
      /* Arquivo temporário cifrado; limpeza best-effort. */
    }
  }
}

/** Baixa bytes cifrados de um anexo autenticado pelo gateway da conversa. */
export async function downloadNativeChatMedia(
  userId: string,
  conversationId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const storage = await nativeChatStorage(userId)
  const token = await conversationSocketToken()
  const response = await fetch(
    `${API_URL}/conversations/${conversationId}/chat/media/${attachmentId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-votz-chat-device': storage.credentials.id,
        'x-votz-chat-secret': storage.credentials.secret,
      },
      signal,
    },
  )
  if (!response.ok)
    throw new ApiError(
      response.status === 410
        ? 'Este arquivo não está mais guardado no Votz.'
        : 'Não foi possível baixar o arquivo.',
      response.status,
    )
  return new Uint8Array(await response.arrayBuffer())
}
