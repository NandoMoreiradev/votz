import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { api, json } from './api'
import { nativeChatStorage } from './chat-storage'

type NotificationsModule = {
  setNotificationChannelAsync: (
    id: string,
    channel: { name: string; importance: number; sound?: string },
  ) => Promise<unknown>
  getPermissionsAsync: () => Promise<{ status: string }>
  requestPermissionsAsync: () => Promise<{ status: string }>
  getExpoPushTokenAsync: (options?: { projectId?: string }) => Promise<{ data: string }>
  addNotificationResponseReceivedListener: (
    listener: (response: {
      notification: { request: { content: { data?: Record<string, unknown> } } }
    }) => void,
  ) => { remove: () => void }
  AndroidImportance?: { HIGH: number }
}

async function loadNotifications(): Promise<NotificationsModule | null> {
  try {
    // Dynamic import: builds antigos sem expo-notifications continuam funcionando sem erro.
    const moduleName = 'expo-notifications'
    return (await import(moduleName)) as unknown as NotificationsModule
  } catch {
    return null
  }
}

let lastRegisteredKey: string | null = null

/**
 * Registra o token Expo Push deste aparelho na API do Votz para receber
 * avisos discretos de novas mensagens com o aplicativo fechado (zero conteúdo no payload).
 */
export async function registerChatPushToken(userId: string): Promise<void> {
  const notifications = await loadNotifications()
  if (!notifications) return
  try {
    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync('chat-messages', {
        name: 'Conversas',
        importance: notifications.AndroidImportance?.HIGH ?? 4,
        // Sem o campo "sound" o Android usa o som padrão de notificação. Passar 'default' faz o
        // expo-notifications procurar um arquivo de som chamado "default" (que não existe) e reclamar.
      })
      await notifications.setNotificationChannelAsync('votz-notifications', {
        name: 'Notificações do Votz',
        importance: notifications.AndroidImportance?.HIGH ?? 4,
      })
    }
    const existing = await notifications.getPermissionsAsync()
    let status = existing.status
    if (status !== 'granted') {
      const asked = await notifications.requestPermissionsAsync()
      status = asked.status
    }
    if (status !== 'granted') return

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
    const { data: token } = await notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
    if (!token) return

    const cacheKey = `${userId}:${token}`
    if (lastRegisteredKey === cacheKey) return

    const storage = await nativeChatStorage(userId)
    await api('/conversations/chat/devices/push-token', {
      method: 'PUT',
      ...json({ token }),
      headers: {
        'x-votz-chat-device': storage.credentials.id,
        'x-votz-chat-secret': storage.credentials.secret,
      },
    })
    lastRegisteredKey = cacheKey
  } catch {
    /* Push é best-effort: nunca impede a conversa de abrir. */
  }
}

/** Limpa o token de push deste aparelho (ex.: ao sair da conta ou redefinir). */
export async function clearChatPushToken(userId: string): Promise<void> {
  lastRegisteredKey = null
  try {
    const storage = await nativeChatStorage(userId)
    await api('/conversations/chat/devices/push-token', {
      method: 'DELETE',
      headers: {
        'x-votz-chat-device': storage.credentials.id,
        'x-votz-chat-secret': storage.credentials.secret,
      },
    })
  } catch {
    /* Best-effort. */
  }
}

/**
 * Escuta toques em notificações push de conversa e chama `onOpen(conversationId)`.
 * Retorna função de limpeza.
 */
export function subscribeChatPushOpen(
  onOpen: (conversationId: string) => void,
): () => void {
  let remove = () => {}
  let cancelled = false
  void loadNotifications().then((notifications) => {
    if (!notifications || cancelled) return
    const sub = notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data
        if (
          data?.type === 'chat_message' &&
          typeof data.conversationId === 'string'
        ) {
          onOpen(data.conversationId)
        }
      },
    )
    remove = () => sub.remove()
  })
  return () => {
    cancelled = true
    remove()
  }
}

export function subscribeGeneralPushOpen(
  onNavigate: (target: { pathname: string; params?: Record<string, string> }) => void,
): () => void {
  let remove = () => {}
  let cancelled = false
  void loadNotifications().then((notifications) => {
    if (!notifications || cancelled) return
    const sub = notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data
      if (!data || data.type === 'chat_message') return
      if (typeof data.reportId === 'string' && data.reportId) {
        onNavigate({ pathname: '/report/[id]', params: { id: data.reportId } })
      } else if (typeof data.postId === 'string' && data.postId) {
        onNavigate({ pathname: '/post/[id]', params: { id: data.postId } })
      } else if (typeof data.surveySlug === 'string' && data.surveySlug) {
        onNavigate({ pathname: '/pesquisas/[slug]', params: { slug: data.surveySlug } })
      } else {
        onNavigate({ pathname: '/notifications' })
      }
    })
    remove = () => sub.remove()
  })
  return () => {
    cancelled = true
    remove()
  }
}
