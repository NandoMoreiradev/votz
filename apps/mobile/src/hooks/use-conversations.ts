import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { chatPreviews } from '@votz/chat-core'
import type {
  ConversationBlocksPage,
  ConversationCapabilities,
  ConversationPerson,
  ConversationSettings,
  ConversationSummary,
  ConversationsPage,
  ConversationTypingEvent,
  UpdateConversationSettings,
} from '@votz/shared-types'
import { api, API_URL, conversationSocketToken } from '../lib/api'
import { clearTyping, recordTyping } from '../lib/chat-typing'
import { useSession } from '../lib/session'

export function useConversationScope() {
  const user = useSession((s) => s.user)
  return {
    user,
    enabled: !!user?.emailVerified,
    key: ['conversations', user?.id, 'personal'] as const,
  }
}
export function useConversationCapabilities() {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'capabilities'],
    queryFn: ({ signal }) =>
      api<ConversationCapabilities>('/conversations/capabilities', { signal }),
    enabled: scope.enabled,
    staleTime: 30_000,
    retry: false,
  })
}
export function useConversationList(folder: 'active' | 'requests') {
  const scope = useConversationScope()
  return useInfiniteQuery({
    queryKey: [...scope.key, 'list', folder],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<ConversationsPage>(`/conversations?folder=${folder}&page=${pageParam}&limit=20`, {
        signal,
      }),
    getNextPageParam: (page) => (page.page * page.limit < page.total ? page.page + 1 : undefined),
    enabled: scope.enabled,
    retry: false,
    refetchInterval: 15_000,
  })
}
export function useConversationBlocks() {
  const scope = useConversationScope()
  return useInfiniteQuery({
    queryKey: [...scope.key, 'blocks'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<ConversationBlocksPage>(`/conversations/blocks?page=${pageParam}&limit=20`, { signal }),
    getNextPageParam: (page) => (page.page * page.limit < page.total ? page.page + 1 : undefined),
    enabled: scope.enabled,
    retry: false,
  })
}
export function useConversation(id: string) {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'detail', id],
    queryFn: ({ signal }) => api<ConversationSummary>(`/conversations/${id}`, { signal }),
    enabled: scope.enabled && !!id,
    retry: false,
    refetchInterval: 15_000,
  })
}
export function useConversationContacts(search: string) {
  const scope = useConversationScope()
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])
  return useQuery({
    queryKey: [...scope.key, 'contacts', query],
    queryFn: ({ signal }) =>
      api<ConversationPerson[]>(`/conversations/contacts?q=${encodeURIComponent(query)}`, {
        signal,
      }),
    enabled: scope.enabled && query.length >= 2,
    retry: false,
  })
}
export function useConversationAction() {
  const scope = useConversationScope()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string
      body?: unknown
      method?: 'POST' | 'PATCH' | 'DELETE'
    }) =>
      api<ConversationSummary>(`/conversations${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    retry: false,
    onSuccess: () => client.invalidateQueries({ queryKey: scope.key }),
    onError: () => client.invalidateQueries({ queryKey: scope.key }),
  })
}
export function useConversationSettings() {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'settings'],
    queryFn: ({ signal }) =>
      api<ConversationSettings>('/conversations/settings', { signal }),
    enabled: scope.enabled,
    staleTime: 30_000,
    retry: false,
  })
}
export function useUpdateConversationSettings() {
  const scope = useConversationScope()
  const client = useQueryClient()
  const key = [...scope.key, 'settings'] as const
  return useMutation({
    mutationFn: (body: UpdateConversationSettings) =>
      api<ConversationSettings>('/conversations/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    retry: false,
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<ConversationSettings>(key)
      if (previous) client.setQueryData<ConversationSettings>(key, { ...previous, ...patch })
      return { previous }
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },
    onSuccess: (data) => {
      client.setQueryData(key, data)
      void client.invalidateQueries({ queryKey: scope.key })
    },
  })
}

export function ConversationsLive() {
  const userId = useSession((s) => s.user?.id)
  const capability = useConversationCapabilities()
  const enabled = capability.data?.enabled === true
  const client = useQueryClient()
  useEffect(() => {
    if (!userId || !enabled) return
    const socket = io(`${API_URL.replace(/\/api\/v1\/?$/, '')}/ws`, {
      autoConnect: false,
      transports: ['websocket'],
      reconnectionAttempts: 5,
      auth: (callback) => {
        void conversationSocketToken()
          .then((token) => callback({ token }))
          .catch(() => callback({ token: '' }))
      },
    })
    const invalidate = () => {
      void client.invalidateQueries({ queryKey: ['conversations', userId] })
    }
    socket.on('connect', invalidate)
    socket.on('conversation:changed', invalidate)
    socket.on('chat:device-link', invalidate)
    socket.on('chat:device-link-decided', invalidate)
    socket.on('conversation:typing', (data: ConversationTypingEvent) => {
      recordTyping(data)
    })
    const update = (state: string) => {
      if (state === 'active') socket.connect()
      else {
        socket.disconnect()
        // Texto aberto não fica na memória com o aplicativo em segundo plano.
        chatPreviews.clear()
        clearTyping()
      }
    }
    update(AppState.currentState || 'active')
    const listener = AppState.addEventListener('change', update)
    return () => {
      listener.remove()
      socket.removeAllListeners()
      socket.disconnect()
      chatPreviews.clear()
      clearTyping()
    }
  }, [client, userId, enabled])
  return null
}
