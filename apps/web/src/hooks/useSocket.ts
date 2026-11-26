import { useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth.store'
import { getToken } from '../lib/token'
import { queryClient } from '../lib/query-client'
import { clearTyping, recordTyping } from '../lib/chat-typing'
import type { ConversationTypingEvent } from '@votz/shared-types'

let socket: Socket | null = null

function getWsBase(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined
  if (apiUrl) return apiUrl.replace(/\/api\/v1\/?$/, '')
  return 'http://localhost:3000'
}

export function useSocket() {
  const userId = useAuthStore((s) => s.user?.id)
  const sessionReady = useAuthStore((s) => s.sessionReady)

  useEffect(() => {
    if (!userId || !sessionReady) {
      socket?.disconnect()
      socket = null
      return
    }

    const token = getToken()
    if (!token) return

    socket = io(`${getWsBase()}/ws`, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket'],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15_000,
    })

    socket.on('notification', () => {
      // Invalida contagem e lista — o bell, o painel e /notificacoes atualizam em tempo real
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    })
    socket.on('conversation:changed', () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    })
    socket.on('chat:device-link', () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    })
    socket.on('chat:device-link-decided', () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    })
    socket.on('chat:history-transfer', () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    })
    socket.on('conversation:typing', (data: ConversationTypingEvent) => {
      recordTyping(data)
    })
    socket.on('connect', () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    })

    socket.on('debate:live', (data: { debateId: string; title: string }) => {
      queryClient.invalidateQueries({ queryKey: ['debates'] })
      // toast is handled by components that listen to this query cache update
      console.info(`[debate] ao vivo: ${data.title} — /debates/${data.debateId}`)
    })

    socket.on('connect_error', (err) => {
      console.warn('[ws] connection error:', err.message)
    })

    return () => {
      clearTyping()
      void queryClient.cancelQueries({ queryKey: ['conversations', userId] })
      queryClient.removeQueries({ queryKey: ['conversations', userId] })
      socket?.disconnect()
      socket = null
    }
  }, [userId, sessionReady])
}
