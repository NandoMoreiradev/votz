import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

export interface AppNotification {
  id: string
  type:
    | 'NEW_COMMENT'
    | 'COMMENT_REPLY'
    | 'STATUS_CHANGED'
    | 'REPORT_UPDATE'
    | 'NEW_REPORT_RECEIVED'
    | 'REPORT_REASSIGNED'
    | 'REPORT_DISPUTED'
    | 'REPORT_ADVOCATED'
    | 'REPORT_RESOLVED'
    | 'DISPUTE_PENDING_REVIEW'
    | 'DISPUTE_DECIDED'
    | 'ADVOCACY_DEADLINE_PASSED'
    | 'SURTO_DETECTED'
    | 'ALERT_RULE_MATCHED'
    | 'WEEKLY_DIGEST'
    | 'SLA_AT_RISK'
    | 'SLA_BREACHED'
    | 'SLA_ESCALATED'
    | 'REPORT_ASSIGNED'
    | 'POST_LIKE'
    | 'POST_COMMENT'
    | 'POST_COMMENT_REPLY'
    | 'POST_REPOST'
    | 'POST_QUOTE'
    | 'POST_MENTION'
    | 'OFFICIAL_SURVEY_PUBLISHED'
    | 'SURVEY_REVIEWED'
    | 'AD_APPROVED'
    | 'AD_REJECTED'
    | 'AD_LOW_BALANCE'
    | 'AD_PAUSED_NO_BALANCE'
    | 'AD_INVALID_TRAFFIC'
    | 'AD_LANDING_PAGE'
    | 'AD_REFUND_PAID'
    | 'AD_REFUND_REJECTED'
    | 'AD_AUTO_TOPUP_STOPPED'
    | 'AD_INVOICE_ISSUED'
    | 'PRESS_CREDENTIAL_APPROVED'
    | 'PRESS_CREDENTIAL_REJECTED'
    | 'PRESS_CREDENTIAL_REVOKED'
    | 'PRESS_RADAR_HIT'
    | 'PRESS_CONTACT_REQUEST'
    | 'PRESS_CONTACT_ACCEPTED'
    | 'PRESS_CONTACT_DECLINED'
    | 'CONTEXT_NOTE_SHOWN'
  read: boolean
  createdAt: string
  metadata: Record<string, unknown> | null
  report: { id: string; title: string } | null
}

interface NotificationsResponse {
  data: AppNotification[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export function useNotifications(opts?: {
  enabled?: boolean
  page?: number
  limit?: number
  unreadOnly?: boolean
}) {
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const page = opts?.page ?? 1
  const limit = opts?.limit ?? 20
  const unreadOnly = opts?.unreadOnly ?? false
  const isEnabled = (opts?.enabled ?? true) && !!user && sessionReady

  return useQuery({
    queryKey: ['notifications', { page, limit, unreadOnly }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (unreadOnly) params.set('unreadOnly', 'true')
      return api.get<NotificationsResponse>(`/notifications?${params.toString()}`).then((r) => r.data)
    },
    enabled: isEnabled,
    refetchInterval: isEnabled ? 60_000 : false,
    staleTime: 15_000,
  })
}

export function useUnreadCount() {
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count').then((r) => r.data.count),
    enabled: !!user && sessionReady,
    refetchInterval: 60_000,
    staleTime: 20_000,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}
