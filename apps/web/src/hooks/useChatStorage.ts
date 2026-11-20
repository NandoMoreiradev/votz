import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatStorageApi, type ChatHttp } from '@votz/chat-core'
import { api } from '../lib/api'
import { webChatStorage } from '../lib/chat-storage'
import { useConversationScope } from './useConversations'

const PAGE_SIZE = 50

/**
 * Chamadas com as credenciais DESTE navegador, sem abrir o motor criptográfico
 * (mesmo caminho da lista de aparelhos).
 */
async function withStorage<T>(
  userId: string,
  work: (storage: ReturnType<typeof chatStorageApi>) => Promise<T>,
) {
  const store = await webChatStorage(userId)
  try {
    const headers = {
      'x-votz-chat-device': store.credentials.id,
      'x-votz-chat-secret': store.credentials.secret,
    }
    const http: ChatHttp = async (path, method = 'GET', body) =>
      (
        await api.request({
          url: `/conversations${path}`,
          method,
          data: body,
          headers,
        })
      ).data
    return await work(chatStorageApi(http))
  } finally {
    store.close()
  }
}

/** Uso do espaço e arquivos enviados pela pessoa, do maior para o menor ou do mais novo para o mais antigo. */
export function useChatStorage(sort: 'size' | 'date') {
  const scope = useConversationScope()
  return useInfiniteQuery({
    queryKey: [...scope.key, 'chat-storage', sort],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      withStorage(scope.user!.id, (storage) =>
        storage.list({ sort, skip: pageParam, take: PAGE_SIZE }),
      ),
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
    mutationFn: (ids: string[]) =>
      withStorage(scope.user!.id, (storage) => storage.remove(ids)),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: [...scope.key, 'chat-storage'] }),
  })
}
