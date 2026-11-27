import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import { CivicTopicSummaryDto, TopicDetailResponse } from '../types/api'

export function useTrendingTopics(params: { state?: string; city?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['topics', 'trending', params],
    queryFn: () =>
      api
        .get<CivicTopicSummaryDto[]>('/topics/trending', {
          params: {
            limit: params.limit ?? 8,
            state: params.state || undefined,
            city: params.city || undefined,
          },
        })
        .then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useTopicSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: ['topics', 'search', q],
    queryFn: () =>
      api
        .get<CivicTopicSummaryDto[]>('/topics/search', { params: { q, limit: 6 } })
        .then((r) => r.data),
    enabled,
    staleTime: 15_000,
  })
}

export function useTopicDetail(slug: string) {
  return useQuery({
    queryKey: ['topics', 'detail', slug],
    queryFn: () => api.get<TopicDetailResponse>(`/topics/${slug}`).then((r) => r.data),
    enabled: !!slug,
  })
}

export function useFollowTopic(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ following: boolean }>(`/topics/${slug}/follow`).then((r) => r.data),
    onSuccess: (res) => {
      qc.setQueryData<TopicDetailResponse>(['topics', 'detail', slug], (old) =>
        old ? { ...old, following: res.following } : old,
      )
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['topics', 'following'] })
    },
  })
}

/** Pautas que a pessoa segue (a mais ativa primeiro). Só roda com a pessoa entrada. */
export function useFollowedTopics(limit = 5) {
  const userId = useAuthStore((s) => s.user?.id)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  return useQuery({
    queryKey: ['topics', 'following', userId, limit],
    queryFn: () =>
      api.get<CivicTopicSummaryDto[]>('/topics/me/following', { params: { limit } }).then((r) => r.data),
    enabled: sessionReady && !!userId,
    staleTime: 60_000,
  })
}
