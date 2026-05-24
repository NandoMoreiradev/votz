import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Category, ReportStatus } from '@votz/shared-types'
import { ReportsResponse } from '../types/api'

export interface UpdateStatusPayload {
  status?: string
  content: string
  media?: string[]
}

interface UseReportsParams {
  category?: Category
  status?: ReportStatus
  city?: string
  state?: string
  page?: number
  limit?: number
}

export function useReports(params: UseReportsParams = {}) {
  return useQuery({
    queryKey: ['reports', params],
    queryFn: () =>
      api
        .get<ReportsResponse>('/reports', { params: { ...params, limit: params.limit ?? 20 } })
        .then((r) => r.data),
    staleTime: 30_000,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report', reportId] }),
  })
}
