import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface Surto {
  id: string
  category: string
  city: string
  state: string
  count: number
  active: boolean
  detectedAt: string
  updatedAt: string
}

export interface SurtoReport {
  id: string
  title: string
  description: string
  category: string
  status: string
  anonymous: boolean
  city: string | null
  state: string | null
  neighborhood: string | null
  pressureScore: number
  createdAt: string
  entityResponded: boolean
  _count: { votes: number; comments: number }
  author: { id: string; name: string; avatarUrl: string | null } | null
}

export interface SurtoDetail extends Surto {
  reports: SurtoReport[]
  entityResponded: boolean
}

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get<Surto[]>('/alerts').then((r) => r.data),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
}

export function useSurto(id: string) {
  return useQuery({
    queryKey: ['surto', id],
    queryFn: () => api.get<SurtoDetail>(`/alerts/${id}`).then((r) => r.data),
    staleTime: 30_000,
  })
}
