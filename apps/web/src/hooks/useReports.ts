import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Category, ReportStatus } from '@votz/shared-types'
import { ReportsResponse } from '../types/api'

interface UseReportsParams {
  category?: Category
  status?: ReportStatus
  city?: string
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
