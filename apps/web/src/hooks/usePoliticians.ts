import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Politician, PoliticiansResponse, UserReportsResponse } from '../types/api'

export interface Party {
  id: string
  name: string
  abbreviation: string
  number: number
  logoUrl: string | null
}

export interface UpdatePoliticianPayload {
  name?: string
  partyId?: string
  office?: string
  termStart?: string
  termEnd?: string
  electoralZone?: string
  state?: string
  city?: string
  avatarUrl?: string
  website?: string
}

interface UsePoliticiansParams {
  state?: string
  city?: string
  party?: string
  office?: string
  search?: string
  verified?: boolean
  enabled?: boolean
  page?: number
}

export function usePoliticians(params: UsePoliticiansParams = {}) {
  const { enabled = true, ...queryParams } = params
  return useQuery({
    queryKey: ['politicians', queryParams],
    queryFn: () =>
      api.get<PoliticiansResponse>('/politicians', { params: { ...queryParams, limit: 20 } }).then((r) => r.data),
    staleTime: 60_000,
    enabled,
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

export function useUpdatePolitician(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdatePoliticianPayload) =>
      api.patch<Politician>(`/politicians/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['politician', id] })
    },
  })
}

export function useParties() {
  return useQuery<Party[]>({
    queryKey: ['parties'],
    queryFn: () => api.get<Party[]>('/parties').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export function usePoliticianReports(politicianId: string, page = 1, status?: string) {
  return useQuery({
    queryKey: ['politician-reports', politicianId, page, status],
    queryFn: () =>
      api
        .get<UserReportsResponse>(`/politicians/${politicianId}/reports`, { params: { page, limit: 10, status } })
        .then((r) => r.data),
    enabled: !!politicianId,
    staleTime: 30_000,
  })
}
