import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SuggestionCategory, SuggestionStatus } from '@votz/shared-types'
import { api } from '../lib/api'

export interface PlatformSuggestionItem {
  id: string
  authorId: string
  title: string
  description: string
  category: SuggestionCategory
  status: SuggestionStatus
  adminNote: string | null
  reviewedAt: string | null
  votesCount: number
  hasVoted: boolean
  createdAt: string
  author: {
    id: string
    name: string
    avatarUrl: string | null
    type: string
  }
}

export interface SuggestionsResponse {
  data: PlatformSuggestionItem[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export function useSuggestions(params: {
  status?: SuggestionStatus
  category?: SuggestionCategory
  sort?: 'top' | 'recent'
  page?: number
}) {
  return useQuery<SuggestionsResponse>({
    queryKey: ['suggestions', params],
    queryFn: () => api.get('/suggestions', { params }).then((r) => r.data),
  })
}

export function useCreateSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { title: string; description: string; category: SuggestionCategory }) =>
      api.post('/suggestions', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suggestions'] })
    },
  })
}

export function useToggleSuggestionVote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/suggestions/${id}/vote`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suggestions'] })
    },
  })
}

export function useUpdateSuggestionStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, adminNote }: { id: string; status: SuggestionStatus; adminNote?: string }) =>
      api.patch(`/suggestions/${id}/status`, { status, adminNote }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suggestions'] })
    },
  })
}

export function useDeleteSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/suggestions/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suggestions'] })
    },
  })
}
