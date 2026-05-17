import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

export interface AppNotification {
  id: string
  type: 'NEW_COMMENT' | 'STATUS_CHANGED'
  read: boolean
  createdAt: string
  metadata: Record<string, unknown> | null
  report: { id: string; title: string }
}

interface NotificationsResponse {
  data: AppNotification[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export function useNotifications() {
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationsResponse>('/notifications?limit=20').then((r) => r.data),
    enabled: !!user && sessionReady,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })
}

export function useUnreadCount() {
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count').then((r) => r.data.count),
    enabled: !!user && sessionReady,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}
