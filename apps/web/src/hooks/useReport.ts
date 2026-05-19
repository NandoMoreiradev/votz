import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Report, FollowersResponse } from '../types/api'

export function useReport(id: string) {
  return useQuery({
    queryKey: ['report', id],
    queryFn: () => api.get<Report>(`/reports/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useFollowers(reportId: string) {
  return useQuery({
    queryKey: ['report-followers', reportId],
    queryFn: () =>
      api.get<FollowersResponse>(`/reports/${reportId}/followers`).then((r) => r.data),
    enabled: !!reportId,
  })
}

export function useFollowStatus(reportId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['report-follow-status', reportId],
    queryFn: () =>
      api.get<{ following: boolean }>(`/reports/${reportId}/follow/me`).then((r) => r.data),
    enabled: !!reportId && enabled,
  })
}

export function useFollowReport(reportId: string) {
  const qc = useQueryClient()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['report-follow-status', reportId] })
    qc.invalidateQueries({ queryKey: ['report-followers', reportId] })
  }

  const follow = useMutation({
    mutationFn: () => api.post(`/reports/${reportId}/follow`).then((r) => r.data),
    onSuccess: invalidate,
  })

  const unfollow = useMutation({
    mutationFn: () => api.delete(`/reports/${reportId}/follow`).then((r) => r.data),
    onSuccess: invalidate,
  })

  return { follow, unfollow }
}
