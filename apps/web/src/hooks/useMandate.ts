import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Category, ReportStatus } from '@votz/shared-types'
import { api } from '../lib/api'

export type MandateSortBy = 'pressure' | 'oldest' | 'recent'

export interface MandateInboxParams {
  status?: ReportStatus | ''
  q?: string
  sortBy?: MandateSortBy
  page?: number
  limit?: number
  category?: Category | ''
  cell7?: string
  stalledDays?: number | ''
  onlyUnanswered?: boolean
  onlyAdvocated?: boolean
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
  cell7: string | null
  pressureScore: number
  firstResponseAt: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  supportCount: number
  commentsCount: number
  advocatedByMe: boolean
  internalTags: OrgTagItem[]
  internalNotes: OrgNoteItem[]
  recentTimeline: Array<{
    id: string
    type: string
    content: string
    createdAt: string
  }>
}

export interface MandateInboxResponse {
  kpis: {
    unansweredCount: number
    advocatedInProgressCount: number
    resolvedThisMonthCount: number
    monthlyGoal: number | null
  }
  capabilities: {
    advancedFilters: boolean
    editableGoal: boolean
    replyTemplates: boolean
  }
  territory: {
    state: string
    cityKey: string | null
    level: 'CITY' | 'STATE'
  }
  items: MandateInboxItem[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface OnboardingStep {
  key: string
  title: string
  completed: boolean
  actionPath: string
}

export interface OnboardingResponse {
  dismissed: boolean
  completedCount: number
  totalCount: number
  steps: OnboardingStep[]
}

export interface DigestSettingsResponse {
  digestEnabled: boolean
  digestDayOfWeek: number
  digestHour: number
  digestLegalBasis: string | null
  digestLegalBasisAcceptedAt: string | null
  digestLastSentWeek: string | null
  monthlyGoal: number | null
}

export type AlertRuleType =
  | 'NEW_REPORT'
  | 'PRESSURE_THRESHOLD'
  | 'SURTO'
  | 'STALLED_REPORT'
export type AlertChannel = 'IN_APP' | 'EMAIL'
export type AlertFrequency = 'IMMEDIATE' | 'DAILY_DIGEST'

export interface AlertRuleItem {
  id: string
  name: string
  ruleType: AlertRuleType
  categories: Category[]
  cell7s: string[]
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
  usageCount: number
  updatedAt: string
}

export interface AccountabilityReportItem {
  id: string
  code: string
  periodStart: string
  periodEnd: string
  dictionaryVersion: string
  status: 'PENDING' | 'READY' | 'FAILED'
  pdfExpiresAt: string | null
  hasPdf: boolean
  errorMessage: string | null
  createdAt: string
  publicVerificationPath: string
}

export interface ShareCardItem {
  id: string
  format: 'FEED' | 'STORIES'
  periodStart: string
  periodEnd: string
  metricsHash: string
  createdAt: string
  imageUrl: string
  publicPageUrl: string
}

export type WebhookEventType =
  | 'REPORT_CREATED'
  | 'REPORT_STATUS_CHANGED'
  | 'REPORT_PRESSURE_THRESHOLD'
  | 'OUTBREAK_DETECTED'
  | 'SLA_AT_RISK'
  | 'SLA_BREACHED'
  | 'REPORT_ASSIGNED'

export interface WebhookEndpointItem {
  id: string
  url: string
  events: WebhookEventType[]
  secretPrefix: string
  active: boolean
  consecutiveFailures: number
  disabledReason: string | null
  createdAt: string
}

export interface WebhookDeliveryItem {
  id: string
  eventId: string
  eventType: WebhookEventType
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  httpStatus: number | null
  latencyMs: number | null
  attemptCount: number
  errorMessage: string | null
  createdAt: string
  deliveredAt: string | null
}

function cleanParams(params: MandateInboxParams) {
  const out: Record<string, string | number | boolean> = {}
  if (params.status) out.status = params.status
  if (params.q) out.q = params.q
  if (params.sortBy) out.sortBy = params.sortBy
  if (params.page) out.page = params.page
  if (params.limit) out.limit = params.limit
  if (params.category) out.category = params.category
  if (params.cell7) out.cell7 = params.cell7
  if (params.stalledDays) out.stalledDays = Number(params.stalledDays)
  if (params.onlyUnanswered) out.onlyUnanswered = true
  if (params.onlyAdvocated) out.onlyAdvocated = true
  return out
}

export function useMandateInbox(params: MandateInboxParams, enabled = true) {
  return useQuery<MandateInboxResponse>({
    queryKey: ['mandate', 'inbox', params],
    queryFn: async () => {
      const { data } = await api.get<MandateInboxResponse>('/mandate/inbox', {
        params: cleanParams(params),
      })
      return data
    },
    enabled,
    retry: false,
  })
}

export function useQuickRespond() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      reportId: string
      message?: string
      templateId?: string
      newStatus?: ReportStatus
      advocate?: boolean
    }) => {
      const { data } = await api.post(`/mandate/inbox/${vars.reportId}/respond`, {
        message: vars.message,
        templateId: vars.templateId,
        newStatus: vars.newStatus,
        advocate: vars.advocate,
      })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mandate'] })
    },
  })
}

export function useUpdateMandateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (monthlyGoal: number | null) => {
      const { data } = await api.put('/mandate/goal', { monthlyGoal })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mandate'] })
    },
  })
}

export function useMandateOnboarding(enabled = true) {
  return useQuery<OnboardingResponse>({
    queryKey: ['mandate', 'onboarding'],
    queryFn: async () => {
      const { data } = await api.get<OnboardingResponse>('/mandate/onboarding')
      return data
    },
    enabled,
    retry: false,
  })
}

export function useUpdateOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { dismissed?: boolean; confirmTerritory?: boolean }) => {
      const { data } = await api.patch('/mandate/onboarding', vars)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mandate', 'onboarding'] })
    },
  })
}

export function useDigestSettings(enabled = true) {
  return useQuery<DigestSettingsResponse>({
    queryKey: ['mandate', 'digest-settings'],
    queryFn: async () => {
      const { data } = await api.get<DigestSettingsResponse>('/mandate/digest/settings')
      return data
    },
    enabled,
    retry: false,
  })
}

export function useUpdateDigestSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      digestEnabled: boolean
      digestDayOfWeek?: number
      digestHour?: number
      legalBasisAccepted?: boolean
    }) => {
      const { data } = await api.put('/mandate/digest/settings', vars)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mandate'] })
    },
  })
}

export function useAlertRules(enabled = true) {
  return useQuery<{
    rules: AlertRuleItem[]
    limit: number
    territory: { state: string; cityKey: string | null; level: string } | null
  }>({
    queryKey: ['alerts', 'rules'],
    queryFn: async () => {
      const { data } = await api.get('/alerts/rules')
      return data
    },
    enabled,
    retry: false,
  })
}

export function useAlertHistory(enabled = true) {
  return useQuery<Array<{
    id: string
    ruleId: string
    reportId: string | null
    surtoId: string | null
    deliveredAt: string
    rule: { name: string; ruleType: AlertRuleType }
  }>>({
    queryKey: ['alerts', 'rules', 'history'],
    queryFn: async () => {
      const { data } = await api.get('/alerts/rules/history')
      return data
    },
    enabled,
    retry: false,
  })
}

export function useCreateAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      name: string
      ruleType: AlertRuleType
      categories?: Category[]
      cell7s?: string[]
      wholeArea: boolean
      minPressure?: number
      stalledDays?: number
      channels: AlertChannel[]
      frequency: AlertFrequency
    }) => {
      const { data } = await api.post('/alerts/rules', body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', 'rules'] })
    },
  })
}

export function useToggleAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { id: string; active: boolean }) => {
      const { data } = await api.patch(`/alerts/rules/${vars.id}`, {
        active: vars.active,
      })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', 'rules'] })
    },
  })
}

export function useDeleteAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/alerts/rules/${id}`)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', 'rules'] })
    },
  })
}

export function useReplyTemplates(enabled = true) {
  return useQuery<{
    items: ReplyTemplateItem[]
    allowedVariables: readonly string[]
    limit: number | null
  }>({
    queryKey: ['mandate', 'templates'],
    queryFn: async () => {
      const { data } = await api.get('/mandate/templates')
      return data
    },
    enabled,
    retry: false,
  })
}

export function useCreateReplyTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { title: string; body: string; category?: Category }) => {
      const { data } = await api.post('/mandate/templates', body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mandate'] })
    },
  })
}

export function useDeleteReplyTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/mandate/templates/${id}`)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mandate'] })
    },
  })
}

export function useAddOrgTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { reportId: string; label: string; color?: string }) => {
      const { data } = await api.post(`/mandate/reports/${vars.reportId}/tags`, {
        label: vars.label,
        color: vars.color,
      })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandate', 'inbox'] }),
  })
}

export function useDeleteOrgTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { reportId: string; tagId: string }) => {
      const { data } = await api.delete(
        `/mandate/reports/${vars.reportId}/tags/${vars.tagId}`,
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandate', 'inbox'] }),
  })
}

export function useAddOrgNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { reportId: string; content: string }) => {
      const { data } = await api.post(`/mandate/reports/${vars.reportId}/notes`, {
        content: vars.content,
      })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandate', 'inbox'] }),
  })
}

export function useAccountabilityReports(enabled = true) {
  return useQuery<{ items: AccountabilityReportItem[]; quota: { usedThisMonth: number; monthlyLimit: number | null } }>({
    queryKey: ['accountability', 'reports'],
    queryFn: async () => {
      const { data } = await api.get('/accountability/reports')
      return data
    },
    enabled,
    retry: false,
    refetchInterval: (query) => {
      const list = query.state.data?.items ?? []
      return list.some((i) => i.status === 'PENDING') ? 2500 : false
    },
  })
}

export function useCreateAccountabilityReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { from: string; to: string }) => {
      const { data } = await api.post('/accountability/reports', vars)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accountability', 'reports'] })
    },
  })
}

export function useShareCards(enabled = true) {
  return useQuery<{
    items: ShareCardItem[]
    quota: { usedThisMonth: number; monthlyLimit: number | null } | null
  }>({
    queryKey: ['share-cards'],
    queryFn: async () => {
      const { data } = await api.get('/share-cards')
      return data
    },
    enabled,
    retry: false,
  })
}

export function useGenerateShareCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { format: 'FEED' | 'STORIES'; from: string; to: string }) => {
      const { data } = await api.post('/share-cards/generate', vars)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share-cards'] }),
  })
}

export function useWebhooks(enabled = true) {
  return useQuery<{ endpoints: WebhookEndpointItem[]; limit: number }>({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const { data } = await api.get('/webhooks')
      return data
    },
    enabled,
    retry: false,
  })
}

export function useCreateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { url: string; events: WebhookEventType[] }) => {
      const { data } = await api.post('/webhooks', vars)
      return data as { id: string; secretOnce: string; url: string }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  })
}

export function useDeleteWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/webhooks/${id}`)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  })
}

export function useWebhookDeliveries(endpointId: string | null) {
  return useQuery<WebhookDeliveryItem[]>({
    queryKey: ['webhooks', 'deliveries', endpointId],
    queryFn: async () => {
      const { data } = await api.get(`/webhooks/${endpointId}/deliveries`)
      return data
    },
    enabled: Boolean(endpointId),
    retry: false,
  })
}
