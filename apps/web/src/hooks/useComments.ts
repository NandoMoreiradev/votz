import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Comment } from '../types/api'

export function useComments(reportId: string) {
  return useQuery({
    queryKey: ['comments', reportId],
    queryFn: () => api.get<Comment[]>(`/reports/${reportId}/comments`).then((r) => r.data),
    enabled: !!reportId,
    staleTime: 15_000,
  })
}

export function useCreateComment(reportId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { content: string; parentId?: string }) =>
      api.post<Comment>(`/reports/${reportId}/comments`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', reportId] })
      qc.invalidateQueries({ queryKey: ['report', reportId] })
    },
  })
}

export function useDeleteComment(reportId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/reports/${reportId}/comments/${commentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', reportId] })
    },
  })
}
