import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Category, ReportStatus } from '@votz/shared-types'

export interface Resumo {
  totalReports: number
  reportsLast30: number
  totalResolved: number
  totalVotes: number
  activeSurtos: number
  responseRate: string
  resolvedRate: string
  generatedAt: string
}

export interface CategoryTrend {
  category: Category
  count: number
  pct: string
}

export interface CidadeTrend {
  city: string | null
  state: string | null
  count: number
}

export interface Tendencias {
  byCategory: CategoryTrend[]
  topCidades: CidadeTrend[]
  period: number
}

export interface RelatoDestaque {
  id: string
  title: string
  description: string
  category: Category
  city: string | null
  state: string | null
  neighborhood: string | null
  pressureScore: number
  status: ReportStatus
  createdAt: string
  _count: { votes: number; comments: number }
}

export interface EntidadeRanking {
  id: string
  legalName: string
  type: string
  city: string | null
  state: string | null
  verified: boolean
  votzScore: number
  logoUrl: string | null
  reportCount: number
}

export interface SurtoAtivo {
  id: string
  category: Category
  city: string
  state: string
  count: number
  active: boolean
  detectedAt: string
  updatedAt: string
}

const STALE = 5 * 60_000

export function useResumo() {
  return useQuery<Resumo>({
    queryKey: ['imprensa', 'resumo'],
    queryFn: () => api.get<Resumo>('/imprensa/resumo').then((r) => r.data),
    staleTime: STALE,
  })
}

export function useTendencias(days = 30) {
  return useQuery<Tendencias>({
    queryKey: ['imprensa', 'tendencias', days],
    queryFn: () => api.get<Tendencias>(`/imprensa/tendencias?days=${days}`).then((r) => r.data),
    staleTime: STALE,
  })
}

export function useRelatosDestaque(limit = 20) {
  return useQuery<RelatoDestaque[]>({
    queryKey: ['imprensa', 'destaque', limit],
    queryFn: () =>
      api.get<RelatoDestaque[]>(`/imprensa/relatos-destaque?limit=${limit}`).then((r) => r.data),
    staleTime: STALE,
  })
}

export function useEntidadesRanking(limit = 20) {
  return useQuery<EntidadeRanking[]>({
    queryKey: ['imprensa', 'entidades', limit],
    queryFn: () =>
      api.get<EntidadeRanking[]>(`/imprensa/entidades-ranking?limit=${limit}`).then((r) => r.data),
    staleTime: 10 * 60_000,
  })
}

export function useSurtosAtivos() {
  return useQuery<SurtoAtivo[]>({
    queryKey: ['imprensa', 'surtos'],
    queryFn: () => api.get<SurtoAtivo[]>('/imprensa/surtos-ativos').then((r) => r.data),
    staleTime: 2 * 60_000,
  })
}

export async function downloadCsv(days: number, state?: string, city?: string, category?: string): Promise<void> {
  const params = new URLSearchParams({ days: String(days) })
  if (state) params.set('state', state)
  if (city) params.set('city', city)
  if (category) params.set('category', category)

  const response = await api.get(`/imprensa/export/csv?${params.toString()}`, {
    responseType: 'blob',
  })

  const disposition = response.headers['content-disposition'] as string | undefined
  const match = disposition?.match(/filename="([^"]+)"/)
  const filename = match?.[1] ?? `votz-relatos-${new Date().toISOString().slice(0, 10)}.csv`

  const url = URL.createObjectURL(response.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
