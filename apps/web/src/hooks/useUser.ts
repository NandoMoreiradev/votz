import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { UserProfile, UserReportsResponse } from '../types/api'

export interface PublicUserSearchItem {
  id: string
  name: string
  username?: string | null
  type: string
  verified: boolean
  avatarUrl: string | null
  bio: string | null
  followersCount: number
}

export interface UserSearchResponse {
  data: PublicUserSearchItem[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function useSearchUsers(params: { search?: string; page?: number; limit?: number; enabled?: boolean }) {
  const { search = '', page = 1, limit = 15, enabled = true } = params
  const normalized = search.trim().replace(/^@+/, '')
  return useQuery({
    queryKey: ['users-search', search.trim(), page, limit],
    queryFn: () =>
      api
        .get<UserSearchResponse>('/users/search', {
          params: { q: search.trim(), page, limit },
        })
        .then((r) => r.data),
    enabled: enabled && normalized.length >= 2,
    staleTime: 30_000,
  })
}

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
