import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { api, API_URL, conversationSocketToken, json } from '../lib/api'
import { useSession } from '../lib/session'
import type { Debate, DebateMessage, DebatePoll, DebateQuestion, DebateStatus, Page, ReactionType } from '../lib/types'

const MAX_MESSAGES = 200

export function useDebateList(status: DebateStatus) {
  return useQuery({
    queryKey: ['debates', status],
    queryFn: ({ signal }) => api<Page<Debate>>(`/debates?status=${status}&limit=20${status === 'SCHEDULED' ? '&upcoming=true' : ''}`, { signal }),
    refetchInterval: status === 'LIVE' ? 30_000 : false,
  })
}
export function useDebate(id: string) {
  return useQuery({ queryKey: ['debate', id], queryFn: ({ signal }) => api<Debate>(`/debates/${id}`, { signal }), enabled: !!id })
}
/** Sem conta não há conexão ao vivo; nesse caso as listas se atualizam sozinhas de tempos em tempos. */
export function useDebateQuestions(id: string, poll: boolean) {
  return useQuery({
    queryKey: ['debate-questions', id], enabled: !!id,
    queryFn: ({ signal }) => api<DebateQuestion[]>(`/debates/${id}/questions`, { signal }),
    refetchInterval: poll ? 15_000 : false,
  })
}
export function useDebateMessages(id: string, poll: boolean) {
  return useQuery({
    queryKey: ['debate-messages', id], enabled: !!id,
    queryFn: ({ signal }) => api<DebateMessage[]>(`/debates/${id}/messages`, { signal }),
    refetchInterval: poll ? 15_000 : false,
  })
}
export function useDebateActivePoll(id: string, poll: boolean) {
  return useQuery({
    queryKey: ['debate-poll', id], enabled: !!id,
    queryFn: ({ signal }) => api<DebatePoll | null>(`/debates/${id}/polls/active`, { signal }),
    refetchInterval: poll ? 15_000 : false,
  })
}

export function useSubmitQuestion(debateId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => api<DebateQuestion>(`/debates/${debateId}/questions`, json({ text })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['debate-questions', debateId] }),
  })
}
export function useUpvoteQuestion(debateId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (questionId: string) => api<DebateQuestion>(`/debates/${debateId}/questions/${questionId}/upvote`, json({})),
    onSuccess: () => client.invalidateQueries({ queryKey: ['debate-questions', debateId] }),
  })
}
export function useVotePoll(debateId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) => api<DebatePoll>(`/debates/${debateId}/polls/${pollId}/vote`, json({ optionId })),
    onSuccess: (poll) => client.setQueryData(['debate-poll', debateId], poll),
  })
}

export interface Flash { id: string; type: ReactionType; x: number }

/**
 * Sala ao vivo do debate: mesmos eventos da web (`/ws/debates`). Quem não entrou na conta só lê; as
 * listas continuam se atualizando por consulta. O socket fecha quando o app vai para segundo plano.
 */
export function useDebateRoom(debateId: string, live: boolean) {
  const client = useQueryClient()
  const userId = useSession((s) => s.user?.id)
  const messagesQuery = useDebateMessages(debateId, live && !userId)
  // Só o que chega pelo socket fica aqui; o histórico vem da consulta e os dois se juntam abaixo.
  const [incoming, setIncoming] = useState<DebateMessage[]>([])
  const [viewerCount, setViewerCount] = useState(0)
  const [flashes, setFlashes] = useState<Flash[]>([])
  const socketRef = useRef<ReturnType<typeof io> | null>(null)
  const cooldownUntil = useRef(0)

  // Histórico (e as novas, quando não há conexão ao vivo) + o que chegou pelo socket, sem repetir.
  const history = messagesQuery.data
  const messages = useMemo(() => {
    const byId = new Map<string, DebateMessage>()
    for (const message of [...(history ?? []), ...incoming]) byId.set(message.id, message)
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-MAX_MESSAGES)
  }, [history, incoming])

  useEffect(() => {
    if (!userId || !debateId) return
    const socket = io(`${API_URL.replace(/\/api\/v1\/?$/, '')}/ws/debates`, {
      autoConnect: false,
      transports: ['websocket'],
      reconnectionAttempts: 5,
      auth: (callback) => {
        void conversationSocketToken().then((token) => callback({ token })).catch(() => callback({ token: '' }))
      },
    })
    socketRef.current = socket
    const timers = new Set<ReturnType<typeof setTimeout>>()

    socket.on('connect', () => { socket.emit('debate:join', { debateId }) })
    socket.on('debate:viewer-count', ({ count }: { count: number }) => setViewerCount(count))
    socket.on('debate:reaction', ({ type, burst }: { type: ReactionType; burst: number }) => {
      for (let i = 0; i < Math.min(burst, 5); i++) {
        const id = `${Date.now()}-${Math.random()}`
        const show = setTimeout(() => {
          timers.delete(show)
          setFlashes((list) => [...list.slice(-14), { id, type, x: Math.random() * 80 + 5 }])
          const hide = setTimeout(() => { timers.delete(hide); setFlashes((list) => list.filter((f) => f.id !== id)) }, 2200)
          timers.add(hide)
        }, i * 80)
        timers.add(show)
      }
    })
    socket.on('debate:new-message', (message: DebateMessage) => {
      setIncoming((list) => list.some((m) => m.id === message.id) ? list : [...list.slice(-(MAX_MESSAGES - 1)), message])
    })
    socket.on('debate:new-question', ({ question }: { question: DebateQuestion }) => {
      client.setQueryData<DebateQuestion[]>(['debate-questions', debateId], (list) => list?.some((q) => q.id === question.id) ? list : [...(list ?? []), question])
    })
    socket.on('debate:new-poll', ({ poll }: { poll: DebatePoll }) => { client.setQueryData(['debate-poll', debateId], poll) })
    socket.on('debate:poll-result', (poll: DebatePoll) => {
      client.setQueryData<DebatePoll | null>(['debate-poll', debateId], (current) => current?.id === poll.id ? poll : current)
    })
    socket.on('debate:status-change', ({ status }: { status: DebateStatus }) => {
      client.setQueryData<Debate>(['debate', debateId], (debate) => debate && { ...debate, status })
    })
    // O anfitrião (ou um debatedor) trocou o link da live: o debate completo vem junto.
    socket.on('debate:stream-change', ({ debate }: { debate: Debate }) => {
      if (debate) client.setQueryData(['debate', debateId], debate)
    })

    const update = (state: string) => {
      if (state === 'active') socket.connect()
      else socket.disconnect()
    }
    update(AppState.currentState || 'active')
    const listener = AppState.addEventListener('change', update)
    return () => {
      listener.remove()
      timers.forEach(clearTimeout)
      socket.emit('debate:leave', { debateId })
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [client, debateId, userId])

  const sendReaction = useCallback((type: ReactionType) => {
    socketRef.current?.emit('debate:reaction', { debateId, type })
  }, [debateId])

  /** Devolve false enquanto o intervalo entre mensagens não passou (o chat tem um tempo mínimo). */
  const sendMessage = useCallback((text: string, chatCooldownSecs: number) => {
    const now = Date.now()
    if (!socketRef.current || now < cooldownUntil.current) return false
    cooldownUntil.current = now + chatCooldownSecs * 1_000
    socketRef.current.emit('debate:message', { debateId, text })
    return true
  }, [debateId])

  return { messages, viewerCount, flashes, sendReaction, sendMessage, connected: !!userId }
}
