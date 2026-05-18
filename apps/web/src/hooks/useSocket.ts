import { useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth.store'
import { getToken } from '../lib/token'
import { queryClient } from '../lib/query-client'

let socket: Socket | null = null

function getWsBase(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined
  if (apiUrl) return apiUrl.replace(/\/api\/v1\/?$/, '')
  return 'http://localhost:3000'
}

export function useSocket() {
  const userId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!userId) {
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
      reconnectionAttempts: 5,
    })

    socket.on('notification', () => {
      // Invalida contagem e lista — o bell e o painel atualizam automaticamente
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    })

    socket.on('connect_error', (err) => {
      console.warn('[ws] connection error:', err.message)
    })

    return () => {
      socket?.disconnect()
      socket = null
    }
  }, [userId])
}
