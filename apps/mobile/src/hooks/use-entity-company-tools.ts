import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AdAccountView,
  AdBillingView,
  AdCampaignView,
  AdDailyStatView,
  AdTopUpMethod,
  AdTopUpView,
  AdView,
  Category,
  CreateAdCampaignInput,
  SurveyQuestionType,
  SurveyReviewStatus,
  SurveyStatus,
} from '@votz/shared-types'
import { api, json } from '../lib/api'

// ── Entidades: SLA / Prazos ──────────────────────────────────────────────────

export type SlaUrgencyFilter = 'ALL' | 'BREACHED' | 'DUE_TODAY' | 'AT_RISK' | 'ON_TIME'

export interface SlaMemberItem {
  userId: string
  name: string | null
  avatarUrl: string | null
  roleName: string
  canRespond: boolean
  canAssign: boolean
}

export interface SlaQueueItem {
  id: string
  title: string
  category: Category
  status: string
  neighborhood: string | null
  city: string | null
  state: string | null
  pressureScore: number
  createdAt: string
  slaDueAt: string | null
  slaState: 'ON_TIME' | 'AT_RISK' | 'BREACHED' | 'MET' | 'MET_LATE' | null
  hoursRemaining: number | null
  hoursOverdue?: number | null
  assignment?: {
    id: string
    assignee: { id: string; name: string | null; avatarUrl: string | null } | null
  } | null
}

export interface SlaWorkloadResponse {
  unassignedCount: number
  members: Array<{
    userId: string
    name: string | null
    roleName: string
    totalAssigned: number
    breached: number
    atRisk: number
    dueToday: number
    onTime: number
  }>
}

export interface SlaPerformanceResponse {
  summary: {
    slaMet: number
    slaBreached: number
    evaluated: number
    complianceRate: { value: number | null; numerator: number; denominator: number }
    firstResponseMedianH: number | null
  }
  byCategory: Array<{
    category: string
    declaredHours: number
    medianResponseHours: number | null
    slaMet: number
    slaBreached: number
    complianceRate: { value: number | null; numerator: number; denominator: number }
  }>
}

export interface SlaPolicyResponse {
  entityId: string
  legalName: string
  slaHours: Record<string, number>
  defaultSlaHoursByCategory: Record<string, number>
  slaEscalationHours: number
}

export interface SlaQueueResponse {
  summary: {
    totalOpen: number
    breached: number
    dueToday: number
    atRisk: number
    onTime: number
    responded: number
    unassigned: number
  }
  items: SlaQueueItem[]
}

export function useSlaQueue(urgency: SlaUrgencyFilter, enabled: boolean) {
  const qs = new URLSearchParams({ limit: '30', sortBy: 'due_asc' })
  if (urgency !== 'ALL') qs.set('urgency', urgency)
  return useQuery<SlaQueueResponse>({
    queryKey: ['sla', 'queue', urgency],
    queryFn: ({ signal }) => api<SlaQueueResponse>(`/sla/queue?${qs.toString()}`, { signal }),
    enabled,
    staleTime: 20_000,
    retry: false,
  })
}

export function useSlaMembers(enabled: boolean) {
  return useQuery<SlaMemberItem[]>({
    queryKey: ['sla', 'members'],
    queryFn: ({ signal }) => api<SlaMemberItem[]>('/sla/members', { signal }),
    enabled,
    staleTime: 60_000,
    retry: false,
  })
}

export function useAssignSlaReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, assigneeId }: { reportId: string; assigneeId: string | null }) =>
      api(`/sla/reports/${reportId}/assign`, json({ assigneeId })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sla'] })
    },
  })
}

export function useSlaWorkload(enabled: boolean) {
  return useQuery<SlaWorkloadResponse>({
    queryKey: ['sla', 'workload'],
    queryFn: ({ signal }) => api<SlaWorkloadResponse>('/sla/workload', { signal }),
    enabled,
    retry: false,
  })
}

export function useSlaPerformance(enabled: boolean) {
  return useQuery<SlaPerformanceResponse>({
    queryKey: ['sla', 'performance'],
    queryFn: ({ signal }) => api<SlaPerformanceResponse>('/sla/performance', { signal }),
    enabled,
    retry: false,
  })
}

export function useSlaPolicy(enabled: boolean) {
  return useQuery<SlaPolicyResponse>({
    queryKey: ['sla', 'policy'],
    queryFn: ({ signal }) => api<SlaPolicyResponse>('/sla/policy', { signal }),
    enabled,
    retry: false,
  })
}

export function useUpdateSlaPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { slaHours?: Record<string, number>; slaEscalationHours?: number }) =>
      api('/sla/policy', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sla'] })
    },
  })
}

// ── Entidades: Consultas Públicas ────────────────────────────────────────────

export interface EntitySurveyRow {
  id: string
  slug: string
  title: string
  status: SurveyStatus
  reviewStatus: SurveyReviewStatus
  reviewNote: string | null
  totalBallots: number
  createdAt: string
}

export function useEntitySurveys(entityId: string | undefined) {
  return useQuery<EntitySurveyRow[]>({
    queryKey: ['surveys', 'entity', entityId],
    queryFn: ({ signal }) => api<EntitySurveyRow[]>(`/surveys/entity/${entityId}`, { signal }),
    enabled: !!entityId,
    staleTime: 30_000,
  })
}

export function useSubmitEntitySurvey(entityId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      title: string
      description: string
      questions: {
        prompt: string
        type: SurveyQuestionType
        required: boolean
        maxSelections: number
        randomizeOptions: boolean
        options: { label: string; isPinnedBottom: boolean }[]
      }[]
    }) => api(`/surveys/entity/${entityId}/submit`, json(payload)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['surveys', 'entity', entityId] })
    },
  })
}

// ── Empresas: Anúncios e Relatórios ──────────────────────────────────────────

const adsBase = (companyId: string) => `/ads/COMPANY/${companyId}`

export function useCompanyAdAccounts(companyId: string | undefined) {
  return useQuery<AdAccountView[]>({
    queryKey: ['ads', companyId, 'accounts'],
    queryFn: ({ signal }) => api<AdAccountView[]>(`${adsBase(companyId!)}/accounts`, { signal }),
    enabled: !!companyId,
    retry: false,
  })
}

export function useCompanyAdCampaigns(companyId: string | undefined, accountId: string | undefined) {
  return useQuery<AdCampaignView[]>({
    queryKey: ['ads', companyId, 'accounts', accountId, 'campaigns'],
    queryFn: ({ signal }) =>
      api<AdCampaignView[]>(`${adsBase(companyId!)}/accounts/${accountId}/campaigns`, { signal }),
    enabled: !!companyId && !!accountId,
    retry: false,
  })
}

export function useCompanyAdBilling(companyId: string | undefined, accountId: string | undefined) {
  return useQuery<AdBillingView>({
    queryKey: ['ads', companyId, 'accounts', accountId, 'billing'],
    queryFn: ({ signal }) =>
      api<AdBillingView>(`${adsBase(companyId!)}/accounts/${accountId}/billing`, { signal }),
    enabled: !!companyId && !!accountId,
    retry: false,
  })
}

export function useCompanyAdStats(companyId: string | undefined, accountId: string | undefined, days = 30) {
  return useQuery<AdDailyStatView[]>({
    queryKey: ['ads', companyId, 'accounts', accountId, 'stats', days],
    queryFn: ({ signal }) =>
      api<AdDailyStatView[]>(`${adsBase(companyId!)}/accounts/${accountId}/stats?days=${days}`, { signal }),
    enabled: !!companyId && !!accountId,
    retry: false,
  })
}

export function useSetCompanyCampaignStatus(companyId: string, accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ campaignId, status }: { campaignId: string; status: 'ACTIVE' | 'PAUSED' }) =>
      api<AdCampaignView>(`${adsBase(companyId)}/campaigns/${campaignId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads', companyId, 'accounts', accountId, 'campaigns'] })
    },
  })
}

export function useCreateCompanyAdAccount(companyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api<AdAccountView>(`${adsBase(companyId)}/accounts`, json({ name })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', companyId, 'accounts'] }),
  })
}

export function useCreateCompanyCampaign(companyId: string, accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAdCampaignInput) =>
      api<AdCampaignView>(`${adsBase(companyId)}/accounts/${accountId}/campaigns`, json(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', companyId, 'accounts', accountId, 'campaigns'] }),
  })
}

export function useDuplicateCompanyCampaign(companyId: string, accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (campaignId: string) =>
      api<AdCampaignView>(`${adsBase(companyId)}/campaigns/${campaignId}/duplicate`, json({})),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', companyId, 'accounts', accountId, 'campaigns'] }),
  })
}

export function useSubmitCompanyAd(companyId: string, accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (adId: string) => api<AdView>(`${adsBase(companyId)}/ads/${adId}/submit`, json({})),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', companyId, 'accounts', accountId, 'campaigns'] }),
  })
}

export function useCreateCompanyTopUp(companyId: string, accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { amountCents: number; method: AdTopUpMethod }) =>
      api<AdTopUpView>(`${adsBase(companyId)}/accounts/${accountId}/topups`, json(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', companyId, 'accounts', accountId, 'billing'] }),
  })
}

export function useConfirmTestTopUp(companyId: string, accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (topUpId: string) =>
      api<AdTopUpView>(`${adsBase(companyId)}/topups/${topUpId}/confirm-test`, json({})),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', companyId, 'accounts', accountId, 'billing'] }),
  })
}

export interface AdStatsByAdItem {
  adId: string
  headline: string
  campaignName: string
  viewableImpressions: number
  clicks: number
  spendCents: number
}

export function useCompanyAdStatsByAd(companyId: string | undefined, accountId: string | undefined, days = 30) {
  return useQuery<AdStatsByAdItem[]>({
    queryKey: ['ads', companyId, 'accounts', accountId, 'stats-by-ad', days],
    queryFn: ({ signal }) =>
      api<AdStatsByAdItem[]>(`${adsBase(companyId!)}/accounts/${accountId}/stats/by-ad?days=${days}`, { signal }),
    enabled: !!companyId && !!accountId,
    retry: false,
  })
}

// ── Empresas: Edição, SLA e Filiais ──────────────────────────────────────────

export interface CompanyBranch {
  id: string
  name: string
  address: string
  city: string
  state: string
}

export interface CompanyDetail {
  id: string
  legalName: string
  tradeName: string | null
  website: string | null
  slaHours: number | null
  logoUrl: string | null
  branches?: CompanyBranch[]
}

export function useCompanyDetail(companyId: string | undefined) {
  return useQuery<CompanyDetail>({
    queryKey: ['companies', companyId],
    queryFn: ({ signal }) => api<CompanyDetail>(`/companies/${companyId}`, { signal }),
    enabled: !!companyId,
  })
}

export function useUpdateCompany(companyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { tradeName?: string; website?: string; slaHours?: number }) =>
      api(`/companies/${companyId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companies', companyId] })
    },
  })
}

export function useCreateCompanyBranch(companyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; address: string; city: string; state: string }) =>
      api(`/companies/${companyId}/branches`, json(payload)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companies', companyId] })
    },
  })
}

export function useDeleteCompanyBranch(companyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (branchId: string) =>
      api(`/companies/${companyId}/branches/${branchId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companies', companyId] })
    },
  })
}
