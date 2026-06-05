import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getToken } from '../lib/token'
import { useDebateStore } from '../store/debate.store'
import { DebateMessage, DebatePoll, DebateQuestion, ReactionType } from '../types/api'

function getWsBase(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined
  if (apiUrl) return apiUrl.replace(/\/api\/v1\/?$/, '')
  return 'http://localhost:3000'
}

export function useDebateSocket(debateId: string) {
  const socketRef = useRef<Socket | null>(null)
  const store = useDebateStore()

  useEffect(() => {
    if (!debateId) return

    const token = getToken()
    if (!token) return

    const socket = io(`${getWsBase()}/ws/debates`, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket'],
      reconnectionDelay: 2000,
      reconnectionAttempts: 5,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('debate:join', { debateId })
    })

    socket.on('debate:viewer-count', ({ count }: { count: number }) => {
      store.setViewerCount(count)
    })

    socket.on('debate:reaction', ({ type, burst }: { type: ReactionType; burst: number }) => {
      for (let i = 0; i < Math.min(burst, 5); i++) {
        setTimeout(() => store.addReactionBurst(type), i * 80)
      }
    })

    socket.on('debate:new-message', (msg: DebateMessage) => {
      store.addMessage(msg)
    })

    socket.on('debate:new-question', ({ question }: { question: DebateQuestion }) => {
      const current = useDebateStore.getState().questions
      useDebateStore.getState().setQuestions([...current, question])
    })

    socket.on('debate:new-poll', ({ poll }: { poll: DebatePoll }) => {
      store.setActivePoll(poll)
    })

    socket.on('debate:poll-result', (poll: DebatePoll) => {
      store.updatePollResult(poll)
    })

    socket.on('debate:status-change', ({ status }: { status: string }) => {
      store.updateDebateStatus(status as never)
    })

    socket.on('connect_error', (err: Error) => {
      console.warn('[ws/debates] error:', err.message)
    })

    return () => {
      socket.emit('debate:leave', { debateId })
      socket.disconnect()
      socketRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateId])

  function sendReaction(type: ReactionType) {
    socketRef.current?.emit('debate:reaction', { debateId, type })
  }

  function sendMessage(text: string) {
    const now = Date.now()
    const cooldown = useDebateStore.getState().chatCooldownUntil
    if (now < cooldown) return false

    const debate = useDebateStore.getState().debate
    const secs = debate?.chatCooldownSecs ?? 5
    useDebateStore.getState().setChatCooldownUntil(now + secs * 1_000)
    socketRef.current?.emit('debate:message', { debateId, text })
    return true
  }

  return { sendReaction, sendMessage }
}
