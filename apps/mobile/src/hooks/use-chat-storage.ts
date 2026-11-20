import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatStorageApi } from '@votz/chat-core'
import { nativeChatDeviceHttp } from '../lib/chat-runtime'
import { useConversationScope } from './use-conversations'

const PAGE_SIZE = 50

/** Uso do espaço e arquivos enviados pela pessoa, do maior para o menor ou do mais novo para o mais antigo. */
export function useChatStorage(sort: 'size' | 'date') {
  const scope = useConversationScope()
  return useInfiniteQuery({
    queryKey: [...scope.key, 'chat-storage', sort],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      chatStorageApi(await nativeChatDeviceHttp(scope.user!.id)).list({
        sort,
        skip: pageParam,
        take: PAGE_SIZE,
      }),
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.reduce((total, page) => total + page.items.length, 0) : undefined,
    enabled: scope.enabled,
    retry: false,
  })
}

export function useDeleteChatStorage() {
  const scope = useConversationScope()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) =>
      chatStorageApi(await nativeChatDeviceHttp(scope.user!.id)).remove(ids),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: [...scope.key, 'chat-storage'] }),
  })
}
