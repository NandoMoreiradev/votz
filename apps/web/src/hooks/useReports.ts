import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Category, ReportStatus } from '@votz/shared-types'
import { ReportsResponse } from '../types/api'

export interface UpdateStatusPayload {
  status?: string
  content: string
  media?: string[]
  /** Resolver sem foto ou documento (explicação no texto). */
  noEvidence?: boolean
  /** Obrigatório para arquivar. */
  archiveReason?: string
}

interface UseReportsParams {
  category?: Category
  status?: ReportStatus
  city?: string
  state?: string
  search?: string
  page?: number
  limit?: number
  enabled?: boolean
}

export function useReports({ enabled = true, ...params }: UseReportsParams = {}) {
  return useQuery({
    queryKey: ['reports', params],
    queryFn: () =>
      api
        .get<ReportsResponse>('/reports', { params: { ...params, limit: params.limit ?? 20 } })
        .then((r) => r.data),
    staleTime: 30_000,
    enabled,
  })
}

export function useDisputeReport(reportId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { reason: string; evidence?: string[] }) =>
      api.post(`/reports/${reportId}/dispute`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report', reportId] }),
  })
}

export function useUpdateReportStatus(reportId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateStatusPayload) =>
      api.patch(`/reports/${reportId}/status`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report', reportId] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export function useResolveDispute(reportId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { decision: 'UPHOLD' | 'REOPEN'; justification: string }) =>
      api.post(`/reports/${reportId}/dispute/resolve`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report', reportId] })
      qc.invalidateQueries({ queryKey: ['dispute-queue'] })
    },
  })
}

/** Autor confirma que o problema foi resolvido (pesa no Mandatômetro). */
export function useConfirmResolution(reportId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/reports/${reportId}/confirm-resolution`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report', reportId] }),
  })
}

/** Desistir da avocação: público, com motivo. */
export function useWithdrawAdvocacy(reportId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => api.post(`/reports/${reportId}/advocacy/withdraw`, { reason }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report', reportId] })
      qc.invalidateQueries({ queryKey: ['report-followers', reportId] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export interface DisputeQueueItem {
  id: string
  title: string
  category: string
  city: string | null
  state: string | null
  recipientType: string | null
  recipientName: string | null
  resolvedWithoutEvidence: boolean
  archiveReason: string | null
  waitingDays: number
  dispute: { content: string; createdAt: string; metadata: Record<string, unknown> } | null
  closing: { type: string; content: string; createdAt: string; metadata: unknown } | null
  repliesAfterDispute: Array<{ id: string; content: string; createdAt: string; metadata: unknown }>
}

/** Fila de contestações para a moderação (mais antigas primeiro). */
export function useDisputeQueue(page = 1, enabled = true) {
  return useQuery({
    queryKey: ['dispute-queue', page],
    queryFn: () =>
      api
        .get<{ data: DisputeQueueItem[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
          '/reports/moderation/disputes',
          { params: { page, limit: 20 } },
        )
        .then((r) => r.data),
    enabled,
  })
}
