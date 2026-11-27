import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Category, ReportStatus } from '@votz/shared-types'
import { api, json } from '../lib/api'

export interface PropostaTimelineEvent {
  id: string
  tipo: string
  conteudo: string
  createdAt: string
  autor?: { id: string; name: string; avatarUrl?: string | null }
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
    party: { abbreviation: string; name: string }
  }
  timeline?: PropostaTimelineEvent[]
}

export interface PropostasResponse {
  data: PublicProposta[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

export interface OrgTagItem {
  id: string
  label: string
  color: string | null
  createdAt: string
}

export interface OrgNoteItem {
  id: string
  content: string
  createdById: string | null
  createdAt: string
}

export interface MandateInboxItem {
  id: string
  protocol: string
  title: string
  description: string
  category: Category
  status: ReportStatus
  state: string | null
  city: string | null
  neighborhood: string | null
  pressureScore: number
  createdAt: string
  supportCount: number
  commentsCount: number
  advocatedByMe: boolean
  internalTags?: OrgTagItem[]
  internalNotes?: OrgNoteItem[]
}

export type AlertRuleType = 'NEW_REPORT' | 'PRESSURE_THRESHOLD' | 'SURTO' | 'STALLED_REPORT'
export type AlertChannel = 'IN_APP' | 'EMAIL'
export type AlertFrequency = 'IMMEDIATE' | 'DAILY_DIGEST'

export interface AlertRuleItem {
  id: string
  name: string
  ruleType: AlertRuleType
  wholeArea: boolean
  minPressure: number | null
  stalledDays: number | null
  channels: AlertChannel[]
  frequency: AlertFrequency
  active: boolean
  createdAt: string
}

export interface ReplyTemplateItem {
  id: string
  title: string
  body: string
  category: Category | null
  createdAt: string
}

export interface AccountabilityReportItem {
  id: string
  status: string
  publicCode: string | null
  periodFrom: string
  periodTo: string
  createdAt: string
  pdfUrl?: string | null
}

export interface MandateInboxResponse {
  kpis: {
    unansweredCount: number
    advocatedInProgressCount: number
    resolvedThisMonthCount: number
    monthlyGoal: number | null
  }
  territory: {
    state: string
    cityKey: string | null
    level: 'CITY' | 'STATE'
  }
  items: MandateInboxItem[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

export function usePropostas(params: { politicoId?: string; status?: string } = {}) {
  const qs = new URLSearchParams({ limit: '30' })
  if (params.politicoId) qs.set('politicoId', params.politicoId)
  if (params.status) qs.set('status', params.status)
  return useQuery<PropostasResponse>({
    queryKey: ['propostas', params],
    queryFn: ({ signal }) => api<PropostasResponse>(`/propostas?${qs.toString()}`, { signal }),
    staleTime: 30_000,
  })
}

export function useProposta(id: string) {
  return useQuery<PublicProposta>({
    queryKey: ['proposta', id],
    queryFn: ({ signal }) => api<PublicProposta>(`/propostas/${id}`, { signal }),
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function useMeuVotoProposta(id: string, enabled: boolean) {
  return useQuery<{ apoio: boolean | null }>({
    queryKey: ['proposta-vote', id],
    queryFn: ({ signal }) => api<{ apoio: boolean | null }>(`/propostas/${id}/vote/me`, { signal }),
    enabled: !!id && enabled,
    retry: false,
  })
}

export function useVotarProposta(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (apoio: boolean) => api(`/propostas/${id}/vote`, json({ apoio })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['proposta', id] })
      void qc.invalidateQueries({ queryKey: ['proposta-vote', id] })
      void qc.invalidateQueries({ queryKey: ['propostas'] })
    },
  })
}

export function useRemoverVotoProposta(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api(`/propostas/${id}/vote`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['proposta', id] })
      void qc.invalidateQueries({ queryKey: ['proposta-vote', id] })
      void qc.invalidateQueries({ queryKey: ['propostas'] })
    },
  })
}

export function useCriarProposta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { titulo: string; descricao: string; categorias: string[]; linkExterno?: string }) =>
      api<PublicProposta>('/propostas', json(data)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['propostas'] })
    },
  })
}

export function useAtualizarStatusProposta(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { status: string; conteudo: string }) =>
      api<PublicProposta>(`/propostas/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['proposta', id] })
      void qc.invalidateQueries({ queryKey: ['propostas'] })
    },
  })
}

export function useMandateInbox(
  params: { onlyUnanswered?: boolean; onlyAdvocated?: boolean; sortBy?: 'pressure' | 'recent' },
  enabled: boolean,
) {
  const qs = new URLSearchParams({ limit: '30', sortBy: params.sortBy ?? 'pressure' })
  if (params.onlyUnanswered) qs.set('onlyUnanswered', 'true')
  if (params.onlyAdvocated) qs.set('onlyAdvocated', 'true')
  return useQuery<MandateInboxResponse>({
    queryKey: ['mandate', 'inbox', params],
    queryFn: ({ signal }) => api<MandateInboxResponse>(`/mandate/inbox?${qs.toString()}`, { signal }),
    enabled,
    staleTime: 20_000,
  })
}

export function useAddOrgTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, label }: { reportId: string; label: string }) =>
      api(`/mandate/reports/${reportId}/tags`, json({ label })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandate', 'inbox'] }),
  })
}

export function useDeleteOrgTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, tagId }: { reportId: string; tagId: string }) =>
      api(`/mandate/reports/${reportId}/tags/${tagId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandate', 'inbox'] }),
  })
}

export function useAddOrgNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, content }: { reportId: string; content: string }) =>
      api(`/mandate/reports/${reportId}/notes`, json({ content })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandate', 'inbox'] }),
  })
}

export function useAlertRules(enabled: boolean) {
  return useQuery<{ items: AlertRuleItem[] }>({
    queryKey: ['alerts', 'rules'],
    queryFn: ({ signal }) => api<{ items: AlertRuleItem[] }>('/alerts/rules', { signal }),
    enabled,
    retry: false,
  })
}

export function useCreateAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      name: string
      ruleType: AlertRuleType
      wholeArea: boolean
      minPressure?: number
      stalledDays?: number
      channels: AlertChannel[]
      frequency: AlertFrequency
    }) => api('/alerts/rules', json(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', 'rules'] }),
  })
}

export function useToggleAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api(`/alerts/rules/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', 'rules'] }),
  })
}

export function useDeleteAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/alerts/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', 'rules'] }),
  })
}

export function useReplyTemplates(enabled: boolean) {
  return useQuery<{ items: ReplyTemplateItem[] }>({
    queryKey: ['mandate', 'templates'],
    queryFn: ({ signal }) => api<{ items: ReplyTemplateItem[] }>('/mandate/templates', { signal }),
    enabled,
    retry: false,
  })
}

export function useCreateReplyTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { title: string; body: string }) => api('/mandate/templates', json(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandate', 'templates'] }),
  })
}

export function useDeleteReplyTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/mandate/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandate', 'templates'] }),
  })
}

export function useAccountabilityReports(enabled: boolean) {
  return useQuery<{ items: AccountabilityReportItem[]; quota?: { usedThisMonth: number; monthlyLimit: number | null } }>({
    queryKey: ['accountability', 'reports'],
    queryFn: ({ signal }) =>
      api<{ items: AccountabilityReportItem[]; quota?: { usedThisMonth: number; monthlyLimit: number | null } }>(
        '/accountability/reports',
        { signal },
      ),
    enabled,
    retry: false,
  })
}

export function useCreateAccountabilityReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { from: string; to: string }) => api('/accountability/reports', json(vars)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accountability', 'reports'] }),
  })
}
