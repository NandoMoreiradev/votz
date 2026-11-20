import { useEffect, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ConversationBlocksPage,
  ConversationCapabilities,
  ConversationPerson,
  ConversationSettings,
  ConversationSummary,
  ConversationsPage,
  ConversationStartOptions,
  CreateConversationGroup,
  UpdateConversationSettings,
} from '@votz/shared-types'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

export function useConversationScope() {
  const { user, activeContext, sessionReady } = useAuthStore()
  return {
    user,
    activeContext,
    enabled: !!user && sessionReady && !activeContext && user.emailVerified,
    key: ['conversations', user?.id, activeContext?.id || 'personal'] as const,
  }
}
export function useConversationCapabilities() {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'capabilities'],
    queryFn: ({ signal }) =>
      api
        .get<ConversationCapabilities>('/conversations/capabilities', { signal })
        .then((r) => r.data),
    enabled: scope.enabled,
    staleTime: 30_000,
    retry: false,
  })
}
export function useConversationsUnread(enabled = true) {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'unread'],
    queryFn: ({ signal }) =>
      api.get<{ unread: number; requests: number }>('/conversations/unread', { signal }).then((r) => r.data),
    enabled: scope.enabled && enabled,
    refetchInterval: 30_000,
    retry: false,
  })
}
export function useConversationList(folder: 'active' | 'requests', enabled = true) {
  const scope = useConversationScope()
  return useInfiniteQuery({
    queryKey: [...scope.key, 'list', folder],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api
        .get<ConversationsPage>('/conversations', {
          signal,
          params: { folder, page: pageParam, limit: 20 },
        })
        .then((r) => r.data),
    getNextPageParam: (page) => (page.page * page.limit < page.total ? page.page + 1 : undefined),
    enabled: scope.enabled && enabled,
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
      api
        .get<ConversationBlocksPage>('/conversations/blocks', {
          signal,
          params: { page: pageParam, limit: 20 },
        })
        .then((r) => r.data),
    getNextPageParam: (page) => (page.page * page.limit < page.total ? page.page + 1 : undefined),
    enabled: scope.enabled,
    retry: false,
  })
}
export function useConversation(id: string) {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'detail', id],
    queryFn: ({ signal }) =>
      api.get<ConversationSummary>(`/conversations/${id}`, { signal }).then((r) => r.data),
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
      api
        .get<ConversationPerson[]>('/conversations/contacts', { signal, params: { q: query } })
        .then((r) => r.data),
    enabled: scope.enabled && query.length >= 2,
    retry: false,
  })
}
export function useConversationStartOptions(enabled = true) {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'start-options'],
    queryFn: ({ signal }) =>
      api.get<ConversationStartOptions>('/conversations/start-options', { signal }).then((r) => r.data),
    enabled: scope.enabled && enabled,
    staleTime: 30_000,
    retry: false,
  })
}
export function useConversationAction() {
  const client = useQueryClient()
  const scope = useConversationScope()
  return useMutation({
    mutationFn: async ({
      path,
      body,
      method = 'POST',
    }: {
      path: string
      body?: unknown
      method?: 'POST' | 'PATCH' | 'DELETE'
    }) => {
      const result = await api.request<ConversationSummary>({
        url: `/conversations${path}`,
        method,
        data: body,
      })
      return result.data
    },
    retry: false,
    onSuccess: () => client.invalidateQueries({ queryKey: scope.key }),
    onError: () => client.invalidateQueries({ queryKey: scope.key }),
  })
}
export function useCreateConversationGroup() {
  const action = useConversationAction()
  return {
    ...action,
    create: (input: CreateConversationGroup) =>
      action.mutateAsync({ path: '/groups', body: input }),
  }
}
export function useConversationSettings() {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'settings'],
    queryFn: ({ signal }) =>
      api.get<ConversationSettings>('/conversations/settings', { signal }).then((r) => r.data),
    enabled: scope.enabled,
    staleTime: 30_000,
    retry: false,
  })
}
export function useUpdateConversationSettings() {
  const client = useQueryClient()
  const scope = useConversationScope()
  const key = [...scope.key, 'settings'] as const
  return useMutation({
    mutationFn: (body: UpdateConversationSettings) =>
      api.patch<ConversationSettings>('/conversations/settings', body).then((r) => r.data),
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
