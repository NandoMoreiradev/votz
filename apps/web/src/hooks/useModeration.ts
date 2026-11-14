import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlagReason, FlagStatus, FlagTargetType } from '@votz/shared-types'
import { api } from '../lib/api'

export const FLAG_REASON_OPTIONS: Array<{ value: FlagReason; label: string }> = [
  { value: FlagReason.FALSE_INFO, label: 'Informação falsa ou enganosa' },
  { value: FlagReason.OFFENSIVE, label: 'Ofensa, xingamento ou discurso de ódio' },
  { value: FlagReason.PERSONAL_DATA, label: 'Exposição de dados pessoais de alguém' },
  { value: FlagReason.SEXUAL_OR_VIOLENT, label: 'Conteúdo sexual ou violento' },
  { value: FlagReason.SPAM_OR_ADS, label: 'Spam ou propaganda' },
  { value: FlagReason.FAKE_PROFILE, label: 'Perfil falso ou se passando por outro' },
  { value: FlagReason.COPYRIGHT, label: 'Violação de direitos autorais' },
  { value: FlagReason.OTHER, label: 'Outro motivo' },
]

export const FLAG_REASON_LABEL_MAP: Record<FlagReason, string> = FLAG_REASON_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = item.label
    return acc
  },
  {} as Record<FlagReason, string>,
)

export interface CreateFlagPayload {
  targetType: FlagTargetType
  targetId: string
  reason: FlagReason
  details?: string
}

export interface ContentFlagItem {
  id: string
  targetType: FlagTargetType
  targetId: string
  reason: FlagReason
  details: string | null
  status: FlagStatus
  resolvedById: string | null
  resolvedAt: string | null
  resolutionNote: string | null
  createdAt: string
  reporter: { id: string; name: string } | null
  targetPreview: {
    title: string | null
    excerpt: string
    link: string | null
    exists: boolean
  }
}

export interface AdminFlagsResponse {
  data: ContentFlagItem[]
  meta: {
    total: number
    openCount: number
    page: number
    limit: number
    totalPages: number
  }
}

export function useFlagContent() {
  return useMutation({
    mutationFn: (payload: CreateFlagPayload) =>
      api.post('/moderation/flags', payload).then((r) => r.data),
  })
}

export function useAdminFlags(status: FlagStatus, page: number, enabled = true) {
  return useQuery({
    queryKey: ['admin-flags', status, page],
    queryFn: () =>
      api
        .get<AdminFlagsResponse>('/admin/flags', {
          params: { status, page, limit: 20 },
        })
        .then((r) => r.data),
    enabled,
    staleTime: 10_000,
  })
}

export function useResolveFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string
      action: 'DISMISS' | 'REMOVE_CONTENT'
      note: string
    }) => api.patch(`/admin/flags/${id}/resolve`, { action, note }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-flags'] })
      qc.invalidateQueries({ queryKey: ['admin-reports'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })
}
