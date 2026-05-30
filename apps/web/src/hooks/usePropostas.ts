import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface PropostaTimelineEvent {
  id: string
  tipo: string
  conteudo: string
  metadata?: Record<string, unknown>
  createdAt: string
  autor?: {
    id: string
    name: string
    avatarUrl?: string | null
  }
}

export interface PublicProposta {
  id: string
  titulo: string
  descricao: string
  status: string
  categorias: string[]
  politicoId: string
  linkExterno?: string | null
  totalApoios: number
  totalRejeicoes: number
  createdAt: string
  updatedAt: string
  politico?: {
    id: string
    name: string
    office: string
    avatarUrl?: string | null
    party: {
      abbreviation: string
      name: string
    }
  }
  timeline?: PropostaTimelineEvent[]
}

interface PropostasResponse {
  data: PublicProposta[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

interface ListPropostasParams {
  politicoId?: string
  status?: string
  categoria?: string
  page?: number
  limit?: number
}

export function usePropostas(params: ListPropostasParams = {}) {
  return useQuery({
    queryKey: ['propostas', params],
    queryFn: () =>
      api.get<PropostasResponse>('/propostas', { params }).then(r => r.data),
    staleTime: 30_000,
  })
}

export function usePoliticianPropostas(politicoId: string, page = 1, status?: string) {
  return useQuery({
    queryKey: ['propostas', { politicoId, page, status }],
    queryFn: () =>
      api
        .get<PropostasResponse>('/propostas', { params: { politicoId, page, limit: 10, ...(status && { status }) } })
        .then(r => r.data),
    enabled: !!politicoId,
    staleTime: 30_000,
  })
}

export function useProposta(id: string) {
  return useQuery({
    queryKey: ['proposta', id],
    queryFn: () => api.get<PublicProposta>(`/propostas/${id}`).then(r => r.data),
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function useMeuVotoProposta(id: string, enabled = true) {
  return useQuery({
    queryKey: ['proposta-vote', id],
    queryFn: () => api.get<{ apoio: boolean | null }>(`/propostas/${id}/vote/me`).then(r => r.data),
    enabled: !!id && enabled,
  })
}

export function useVotarProposta(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (apoio: boolean) =>
      api.post(`/propostas/${id}/vote`, { apoio }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposta', id] })
      qc.invalidateQueries({ queryKey: ['proposta-vote', id] })
    },
  })
}

export function useRemoverVotoProposta(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete(`/propostas/${id}/vote`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposta', id] })
      qc.invalidateQueries({ queryKey: ['proposta-vote', id] })
    },
  })
}

export function useCriarProposta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      titulo: string
      descricao: string
      categorias: string[]
      linkExterno?: string
    }) => api.post<PublicProposta>('/propostas', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['propostas'] })
    },
  })
}

export function useAtualizarStatusProposta(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { status: string; conteudo: string }) =>
      api.patch<PublicProposta>(`/propostas/${id}/status`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposta', id] })
      qc.invalidateQueries({ queryKey: ['propostas'] })
    },
  })
}
