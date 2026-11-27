import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Category,
  MyPressCredential,
  PressBriefing,
  PressContactDeclineReason,
  PressContactReceived,
  PressContactReportStatus,
  PressContactSent,
  PressOutletType,
  PressPlanInfo,
  PressRadarFrequency,
  PressRadarKind,
  PressRadarRuleView,
  PressSearchResponse,
  ReportStatus,
} from '@votz/shared-types'
import { api, json } from '../lib/api'
import { useSession } from '../lib/session'

export interface PressResumo {
  totalReports: number
  reportsLast30: number
  totalResolved: number
  totalVotes: number
  activeSurtos: number
  responseRate: string
  resolvedRate: string
  generatedAt: string
}

export interface PressTendencias {
  byCategory: { category: Category; count: number; pct: string }[]
  topCidades: { city: string | null; state: string | null; count: number }[]
  period: number
}

export interface PressRelatoDestaque {
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

export interface PressEntidadeRanking {
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

export interface PressSurtoAtivo {
  id: string
  category: Category
  city: string
  state: string
  count: number
  active: boolean
  detectedAt: string
  updatedAt: string
}

export function usePressContactStatus(reportId: string, enabled: boolean) {
  const uid = useSession((s) => s.user?.id)
  return useQuery<PressContactReportStatus>({
    queryKey: ['press-contact', 'status', reportId, uid],
    queryFn: ({ signal }) => api<PressContactReportStatus>(`/imprensa/contatos/relatos/${reportId}`, { signal }),
    enabled: !!uid && !!reportId && enabled,
    staleTime: 30_000,
    retry: false,
  })
}

export function useSetPressContactOptIn(reportId: string) {
  const qc = useQueryClient()
  const uid = useSession((s) => s.user?.id)
  return useMutation({
    mutationFn: (pressContactOk: boolean) =>
      api<{ id: string; pressContactOk: boolean }>(`/imprensa/contatos/relatos/${reportId}`, {
        method: 'PATCH',
        body: JSON.stringify({ pressContactOk }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['press-contact', 'status', reportId, uid] }),
  })
}

export function useRequestPressContact() {
  const qc = useQueryClient()
  const uid = useSession((s) => s.user?.id)
  return useMutation({
    mutationFn: (input: { reportId: string; message: string }) =>
      api<PressContactSent>('/imprensa/contatos', json(input)),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['press-contact', 'status', vars.reportId, uid] })
      void qc.invalidateQueries({ queryKey: ['press-contact', 'sent', uid] })
    },
  })
}

export function useReceivedPressContacts(enabled = true) {
  const uid = useSession((s) => s.user?.id)
  return useQuery<PressContactReceived[]>({
    queryKey: ['press-contact', 'received', uid],
    queryFn: ({ signal }) => api<PressContactReceived[]>('/imprensa/contatos/recebidos', { signal }),
    enabled: !!uid && enabled,
    staleTime: 15_000,
  })
}

export function useRespondPressContact() {
  const qc = useQueryClient()
  const uid = useSession((s) => s.user?.id)
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      action: 'accept' | 'decline'
      reply?: string
      viaVotzChat?: boolean
      reason?: PressContactDeclineReason
      block?: boolean
    }) => api(`/imprensa/contatos/${id}/responder`, json(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['press-contact', 'received', uid] }),
  })
}

const STALE = 5 * 60_000

export function usePressResumo() {
  return useQuery<PressResumo>({
    queryKey: ['imprensa', 'resumo'],
    queryFn: ({ signal }) => api<PressResumo>('/imprensa/resumo', { signal }),
    staleTime: STALE,
  })
}

export function usePressTendencias(days = 30) {
  return useQuery<PressTendencias>({
    queryKey: ['imprensa', 'tendencias', days],
    queryFn: ({ signal }) => api<PressTendencias>(`/imprensa/tendencias?days=${days}`, { signal }),
    staleTime: STALE,
  })
}

export function usePressRelatosDestaque(limit = 20) {
  return useQuery<PressRelatoDestaque[]>({
    queryKey: ['imprensa', 'destaque', limit],
    queryFn: ({ signal }) => api<PressRelatoDestaque[]>(`/imprensa/relatos-destaque?limit=${limit}`, { signal }),
    staleTime: STALE,
  })
}

export function usePressEntidadesRanking(limit = 20) {
  return useQuery<PressEntidadeRanking[]>({
    queryKey: ['imprensa', 'entidades', limit],
    queryFn: ({ signal }) => api<PressEntidadeRanking[]>(`/imprensa/entidades-ranking?limit=${limit}`, { signal }),
    staleTime: 10 * 60_000,
  })
}

export function usePressSurtosAtivos() {
  return useQuery<PressSurtoAtivo[]>({
    queryKey: ['imprensa', 'surtos'],
    queryFn: ({ signal }) => api<PressSurtoAtivo[]>('/imprensa/surtos-ativos', { signal }),
    staleTime: 2 * 60_000,
  })
}

export function useSentPressContacts(enabled = true) {
  const uid = useSession((s) => s.user?.id)
  return useQuery<PressContactSent[]>({
    queryKey: ['press-contact', 'sent', uid],
    queryFn: ({ signal }) => api<PressContactSent[]>('/imprensa/contatos/enviados', { signal }),
    enabled: !!uid && enabled,
    staleTime: 30_000,
    retry: false,
  })
}

export function useCancelPressContact() {
  const qc = useQueryClient()
  const uid = useSession((s) => s.user?.id)
  return useMutation({
    mutationFn: (id: string) => api(`/imprensa/contatos/${id}/cancelar`, json({})),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['press-contact', 'sent', uid] }),
  })
}

export function useMyPressCredential(enabled = true) {
  const uid = useSession((s) => s.user?.id)
  return useQuery<MyPressCredential | null>({
    queryKey: ['press-credential', 'mine', uid],
    queryFn: ({ signal }) => api<MyPressCredential | null>('/imprensa/credenciamento/minha', { signal }).then((r) => r || null),
    enabled: !!uid && enabled,
    staleTime: 30_000,
    retry: false,
  })
}

export interface PressCredentialInput {
  outletName: string
  outletType: PressOutletType
  jobTitle?: string
  website: string
  newsroomEmail: string
  coverageArea?: string
  portfolioUrls: string[]
  note?: string
}

export function useCreatePressCredential() {
  const qc = useQueryClient()
  const uid = useSession((s) => s.user?.id)
  return useMutation({
    mutationFn: (input: PressCredentialInput) => api<MyPressCredential>('/imprensa/credenciamento', json(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['press-credential', 'mine', uid] }),
  })
}

export function useResendPressEmail() {
  return useMutation({
    mutationFn: () =>
      api<{ sent: boolean; alreadyConfirmed?: boolean }>('/imprensa/credenciamento/reenviar-email', json({})),
  })
}

export function usePressPlan(enabled = true) {
  const uid = useSession((s) => s.user?.id)
  return useQuery<PressPlanInfo>({
    queryKey: ['press-tools', 'plan', uid],
    queryFn: ({ signal }) => api<PressPlanInfo>('/imprensa/plano', { signal }),
    enabled: !!uid && enabled,
    staleTime: 60_000,
    retry: false,
  })
}

export function useRadarRules(enabled = true) {
  const uid = useSession((s) => s.user?.id)
  return useQuery<PressRadarRuleView[]>({
    queryKey: ['press-tools', 'radar', uid],
    queryFn: ({ signal }) => api<PressRadarRuleView[]>('/imprensa/radar', { signal }),
    enabled: !!uid && enabled,
    staleTime: 30_000,
    retry: false,
  })
}

export function useCreateRadarRule() {
  const qc = useQueryClient()
  const uid = useSession((s) => s.user?.id)
  return useMutation({
    mutationFn: (input: {
      name: string
      kind: PressRadarKind
      states?: string[]
      cities?: string[]
      minPressure?: number
      stalledDays?: number
      frequency?: PressRadarFrequency
    }) => api<PressRadarRuleView>('/imprensa/radar', json(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['press-tools', 'radar', uid] }),
  })
}

export function useUpdateRadarRule() {
  const qc = useQueryClient()
  const uid = useSession((s) => s.user?.id)
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; active?: boolean; name?: string; frequency?: PressRadarFrequency }) =>
      api<PressRadarRuleView>(`/imprensa/radar/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['press-tools', 'radar', uid] }),
  })
}

export function useDeleteRadarRule() {
  const qc = useQueryClient()
  const uid = useSession((s) => s.user?.id)
  return useMutation({
    mutationFn: (id: string) => api(`/imprensa/radar/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['press-tools', 'radar', uid] }),
  })
}

export function usePressSearch() {
  return useMutation({
    mutationFn: ({ q, state }: { q: string; state?: string }) => {
      const qs = new URLSearchParams({ q })
      if (state?.trim()) qs.set('state', state.trim().toUpperCase())
      return api<PressSearchResponse>(`/imprensa/busca?${qs.toString()}`)
    },
  })
}

export function useSurtoBriefing(surtoId: string | null) {
  return useQuery<PressBriefing>({
    queryKey: ['press-ai', 'briefing', surtoId],
    queryFn: ({ signal }) => api<PressBriefing>(`/imprensa/surtos/${surtoId}/briefing`, { signal, timeoutMs: 90_000 }),
    enabled: !!surtoId,
    retry: false,
    staleTime: 10 * 60_000,
  })
}
