import {
  enrollDevice,
  type ChatCredentials,
  type ChatEnrollment,
  type ChatHttp,
  type ChatPendingLink,
  type ChatSession,
  type ChatStorage,
} from '@votz/chat-core'
import { api } from './api'
import { useAuthStore } from '../store/auth.store'
import { forgetWebChat, webChatStorage } from './chat-storage'
import type { WebChatCrypto } from './chat-crypto'

export class WebChatLockBusyError extends Error {
  constructor() {
    super('lock busy')
  }
}

export interface WebChatSession {
  userId: string
  session: ChatSession
  engine: WebChatCrypto
  storage: ChatStorage
  http: ChatHttp
  credentials: ChatCredentials
  uploadMedia: (
    conversationId: string,
    ciphertext: Uint8Array,
    options?: {
      signal?: AbortSignal
      onProgress?: (pct: number) => void
      /** Tipo do anexo (image, video, audio, file), só para a tela "Gerenciar armazenamento". */
      kind?: string
    },
  ) => Promise<{ id: string }>
  downloadMedia: (
    conversationId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<Uint8Array>
}

interface ActiveWebChatSession extends WebChatSession {
  release: () => void
  done: Promise<void>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Nome do aparelho na lista de aparelhos conectados, ex.: "Chrome no Windows". */
function browserLabel() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador'
  const system = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return system ? `${browser} no ${system}` : browser
}

let active: ActiveWebChatSession | null = null
let openingAbort: AbortController | null = null
let openingDone: Promise<void> = Promise.resolve()

/** Indica se o motor cifrado já está aberto em memória para este usuário. */
export function hasWebChatSession(userId: string): boolean {
  return active?.userId === userId
}

/**
 * Encerra a sessão cifrada do navegador (fecha motor WASM, IndexedDB e solta o
 * Web Lock). Chamado ao sair de /conversas, trocar de conta/contexto ou sair do aparelho.
 */
export async function closeWebChatSession(): Promise<void> {
  const current = active
  active = null
  openingAbort?.abort()
  openingAbort = null
  current?.release()
  await Promise.all([current?.done, openingDone])
}

/** Encerra a sessão ativa e apaga todas as credenciais e chaves locais deste usuário. */
export async function resetWebChatSession(userId: string): Promise<void> {
  await closeWebChatSession()
  await forgetWebChat(userId)
}

function openOnce(options: {
  userId: string
  secret: string
  signal: AbortSignal
  onPending: (pending: ChatPendingLink) => void
}): Promise<WebChatSession> {
  const { userId, secret, signal, onPending } = options
  return new Promise<WebChatSession>((accepted, rejected) => {
    if (!navigator.locks) {
      rejected(new Error('Use um navegador atualizado para usar as conversas.'))
      return
    }
    let release = () => {}
    let done: Promise<void> = Promise.resolve()
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const run = navigator.locks.request(
      `votz-chat-${userId}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          rejected(new WebChatLockBusyError())
          return
        }
        const store = await webChatStorage(userId)
        let engine: WebChatCrypto | null = null
        try {
          if (signal.aborted) {
            rejected(new DOMException('Aborted', 'AbortError'))
            return
          }
          const headers = {
            'x-votz-chat-device': store.credentials.id,
            'x-votz-chat-secret': store.credentials.secret,
          }
          const http: ChatHttp = async (path, method = 'GET', body) => {
            const current = useAuthStore.getState()
            if (current.user?.id !== userId || current.activeContext)
              throw new Error('Sessão alterada.')
            return (
              await api.request({
                url: `/conversations${path}`,
                method,
                data: body,
                headers,
              })
            ).data
          }
          // O primeiro aparelho da conta entra direto; os demais mostram um
          // código e esperam a permissão de um aparelho que a pessoa já usa.
          const session = await enrollDevice(
            async () =>
              (
                await api.post<ChatEnrollment>('/conversations/chat/devices', {
                  ...store.credentials,
                  label: browserLabel(),
                })
              ).data,
            { onPending, signal },
          )
          if (signal.aborted) {
            rejected(new DOMException('Aborted', 'AbortError'))
            return
          }
          const { WebChatCrypto } = await import('./chat-crypto')
          try {
            engine = await WebChatCrypto.open(
              session.matrixUserId,
              session.deviceId,
              `votz-keys-${userId}-${session.deviceId}`,
              secret,
            )
          } catch {
            throw new Error(
              store.storeSecret
                ? 'Não foi possível abrir suas conversas neste navegador.'
                : 'Não foi possível abrir suas conversas. Confira a senha.',
            )
          }
          await store.markInitialized()
          if (signal.aborted) {
            rejected(new DOMException('Aborted', 'AbortError'))
            return
          }
          const uploadMedia: WebChatSession['uploadMedia'] = async (
            conversationId,
            ciphertext,
            opts,
          ) => {
            const current = useAuthStore.getState()
            if (current.user?.id !== userId || current.activeContext)
              throw new Error('Sessão alterada.')
            const form = new FormData()
            if (opts?.kind) form.append('kind', opts.kind.toUpperCase())
            const copy = new Uint8Array(ciphertext.byteLength)
            copy.set(ciphertext)
            form.append(
              'file',
              new Blob([copy.buffer], { type: 'application/octet-stream' }),
              'encrypted.bin',
            )
            const response = await api.post<{ id: string }>(
              `/conversations/${conversationId}/chat/media`,
              form,
              {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' },
                signal: opts?.signal,
                onUploadProgress: (event) => {
                  if (opts?.onProgress && event.total)
                    opts.onProgress(
                      Math.min(100, Math.round((event.loaded / event.total) * 100)),
                    )
                },
              },
            )
            return response.data
          }
          const downloadMedia: WebChatSession['downloadMedia'] = async (
            conversationId,
            attachmentId,
            dlSignal,
          ) => {
            const current = useAuthStore.getState()
            if (current.user?.id !== userId || current.activeContext)
              throw new Error('Sessão alterada.')
            const response = await api.get<ArrayBuffer>(
              `/conversations/${conversationId}/chat/media/${attachmentId}`,
              {
                headers,
                responseType: 'arraybuffer',
                signal: dlSignal,
              },
            )
            return new Uint8Array(response.data)
          }
          const entry: ActiveWebChatSession = {
            userId,
            session,
            engine,
            storage: store.storage,
            http,
            credentials: store.credentials,
            uploadMedia,
            downloadMedia,
            release,
            done: Promise.resolve(),
          }
          entry.done = done
          active = entry
          accepted(entry)
          await hold
        } catch (failure) {
          rejected(failure)
        } finally {
          if (active?.release === release) active = null
          engine?.close()
          store.close()
        }
      },
    )
    done = run.then(
      () => undefined,
      () => undefined,
    )
    openingDone = done
    run.catch(rejected)
  })
}

/**
 * Abre ou reutiliza a sessão cifrada do navegador para este usuário.
 * Enquanto a pessoa permanecer em /conversas, trocar de conversa reutiliza
 * o mesmo motor WASM, armazenamento e Web Lock sem reativar nem pedir senha.
 */
export async function acquireWebChatSession(options: {
  userId: string
  secret: string
  signal: AbortSignal
  onPending: (pending: ChatPendingLink) => void
}): Promise<WebChatSession> {
  const { userId, secret, signal, onPending } = options
  if (active?.userId === userId) return active
  if (active && active.userId !== userId) await closeWebChatSession()
  const controller = new AbortController()
  const forwardAbort = () => controller.abort()
  signal.addEventListener('abort', forwardAbort, { once: true })
  openingAbort = controller
  try {
    for (let tries = 0; ; tries++) {
      if (active?.userId === userId) return active
      if (controller.signal.aborted)
        throw new DOMException('Aborted', 'AbortError')
      try {
        return await openOnce({
          userId,
          secret,
          signal: controller.signal,
          onPending,
        })
      } catch (failure) {
        if (
          failure instanceof WebChatLockBusyError &&
          tries < 12 &&
          !controller.signal.aborted
        ) {
          await wait(300)
          continue
        }
        throw failure
      }
    }
  } finally {
    signal.removeEventListener('abort', forwardAbort)
    if (openingAbort === controller) openingAbort = null
  }
}
