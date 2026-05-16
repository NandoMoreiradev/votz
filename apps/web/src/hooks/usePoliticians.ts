import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Politician, PoliticiansResponse, UserReportsResponse } from '../types/api'

interface UsePoliticiansParams {
  state?: string
  city?: string
  party?: string
  office?: string
  search?: string
  page?: number
}

export function usePoliticians(params: UsePoliticiansParams = {}) {
  return useQuery({
    queryKey: ['politicians', params],
    queryFn: () =>
      api.get<PoliticiansResponse>('/politicians', { params: { ...params, limit: 20 } }).then((r) => r.data),
    staleTime: 60_000,
  })
}

export function usePolitician(id: string) {
  return useQuery({
    queryKey: ['politician', id],
    queryFn: () => api.get<Politician>(`/politicians/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function usePoliticianReports(politicianId: string, page = 1) {
  return useQuery({
    queryKey: ['politician-reports', politicianId, page],
    queryFn: () =>
      api
        .get<UserReportsResponse>(`/politicians/${politicianId}/reports`, { params: { page, limit: 10 } })
        .then((r) => r.data),
    enabled: !!politicianId,
    staleTime: 30_000,
  })
}
