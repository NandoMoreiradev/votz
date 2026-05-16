import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { UserProfile, UserReportsResponse } from '../types/api'

export function useUser(id: string) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => api.get<UserProfile>(`/users/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useUserReports(userId: string, page = 1) {
  return useQuery({
    queryKey: ['user-reports', userId, page],
    queryFn: () =>
      api
        .get<UserReportsResponse>(`/users/${userId}/reports`, { params: { page, limit: 10 } })
        .then((r) => r.data),
    enabled: !!userId,
    staleTime: 30_000,
  })
}
