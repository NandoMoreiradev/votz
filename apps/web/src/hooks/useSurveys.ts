import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ResearchInstituteView,
  SurveyComparisonItem,
  SurveyDetailView,
  SurveyDistributionMode,
  SurveyInvitationView,
  SurveyKind,
  SurveyMethodologyType,
  SurveyOrigin,
  SurveyQuestionType,
  SurveyResultsView,
  SurveyResultsVisibility,
  SurveyReviewStatus,
  SurveyScope,
  SurveyStatus,
  SurveySummaryView,
  SurveyVerificationLevel,
} from '@votz/shared-types'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

export interface SurveysConfig {
  enabled: boolean
  electoralLockEnabled: boolean
}

export function useSurveysConfig() {
  return useQuery({
    queryKey: ['surveys', 'config'],
    queryFn: () => api.get<SurveysConfig>('/surveys/config').then((r) => r.data),
    staleTime: 10 * 60_000,
    retry: false,
  })
}

export function useSurveysEnabled(): boolean {
  const { data } = useSurveysConfig()
  return data?.enabled === true
}

export function usePublicSurveys(filters: {
  status?: SurveyStatus
  kind?: SurveyKind
  scope?: SurveyScope
  state?: string
} = {}) {
  const enabled = useSurveysEnabled()
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: ['surveys', 'list', filters, userId ?? 'anon'],
    queryFn: () => api.get<SurveySummaryView[]>('/surveys', { params: filters }).then((r) => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useFeaturedSurveys() {
  const enabled = useSurveysEnabled()
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: ['surveys', 'featured', userId ?? 'anon'],
    queryFn: () => api.get<SurveySummaryView[]>('/surveys/featured').then((r) => r.data),
    enabled,
    staleTime: 2 * 60_000,
  })
}

export function useSurveyDetail(slugOrId: string | undefined) {
  const enabled = useSurveysEnabled()
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: ['surveys', 'detail', slugOrId, userId ?? 'anon'],
    queryFn: () => api.get<SurveyDetailView>(`/surveys/${slugOrId}`).then((r) => r.data),
    enabled: enabled && !!slugOrId,
    staleTime: 30_000,
  })
}

export function useSurveyResults(slugOrId: string | undefined, segment = 'ALL', allow = true) {
  const enabled = useSurveysEnabled()
  return useQuery({
    queryKey: ['surveys', 'results', slugOrId, segment],
    queryFn: () =>
      api.get<SurveyResultsView>(`/surveys/${slugOrId}/results`, { params: { segment } }).then((r) => r.data),
    enabled: enabled && allow && !!slugOrId,
    staleTime: 30_000,
  })
}

export function useSubmitSurveyVote(surveyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (answers: Record<string, string[]>) =>
      api.post<{ recorded: boolean; anonymous: boolean; message: string }>(`/surveys/${surveyId}/vote`, { answers }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['surveys'] })
    },
  })
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AdminSurveyRow {
  id: string
  slug: string
  title: string
  subtitle: string | null
  kind: SurveyKind
  origin: SurveyOrigin
  distributionMode: SurveyDistributionMode
  methodologyType: SurveyMethodologyType
  status: SurveyStatus
  reviewStatus: SurveyReviewStatus
  reviewNote: string | null
  scope: SurveyScope
  targetState: string | null
  targetCity: string | null
  topicKey: string | null
  cooldownDays: number
  targetSampleSize: number | null
  verificationLevel: SurveyVerificationLevel
  resultsVisibility: SurveyResultsVisibility
  minQuorumToPublish: number
  kAnonymityThreshold: number
  featuredInFeed: boolean
  isElectoral: boolean
  tseRegistrationCode: string | null
  partnerName: string | null
  institute: { id: string; slug: string; name: string } | null
  totalBallots: number
  saltDestroyedAt: string | null
  startsAt: string | null
  endsAt: string | null
  closedAt: string | null
  createdAt: string
  _count: {
    questions: number
    participations: number
    pendingBallots: number
    invitations: number
  }
}

export interface CreateSurveyPayload {
  title: string
  subtitle?: string
  description: string
  kind: SurveyKind
  origin?: SurveyOrigin
  distributionMode?: SurveyDistributionMode
  methodologyType?: SurveyMethodologyType
  scope?: SurveyScope
  targetState?: string
  targetCity?: string
  instituteId?: string
  topicKey?: string
  cooldownDays?: number
  targetSampleSize?: number
  partnerName?: string
  contractorName?: string
  marginOfError?: number
  confidenceLevel?: number
  verificationLevel?: SurveyVerificationLevel
  minAccountAgeDays?: number
  resultsVisibility?: SurveyResultsVisibility
  minQuorumToPublish?: number
  kAnonymityThreshold?: number
  featuredInFeed?: boolean
  endsAt?: string
  isElectoral?: boolean
  tseRegistrationCode?: string
  statisticianName?: string
  statisticianConre?: string
  methodologyNote: string
  disclaimerText: string
  questions: {
    prompt: string
    helpText?: string
    type: SurveyQuestionType
    required: boolean
    maxSelections: number
    randomizeOptions: boolean
    options: {
      label: string
      subtitle?: string
      imageUrl?: string
      politicianId?: string
      isPinnedBottom: boolean
    }[]
  }[]
}

export function useAdminSurveys(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'surveys'],
    queryFn: () => api.get<AdminSurveyRow[]>('/admin/surveys').then((r) => r.data),
    enabled,
  })
}

export function useCreateSurvey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateSurveyPayload) => api.post('/admin/surveys', payload).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'surveys'] })
      void qc.invalidateQueries({ queryKey: ['surveys'] })
    },
  })
}

export function usePublishSurvey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/admin/surveys/${id}/publish`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'surveys'] })
      void qc.invalidateQueries({ queryKey: ['surveys'] })
    },
  })
}

export function useCloseSurvey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/admin/surveys/${id}/close`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'surveys'] })
      void qc.invalidateQueries({ queryKey: ['surveys'] })
    },
  })
}

export function useDrainSurveyMixPool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ committed: number; totalBallots: number }>(`/admin/surveys/${id}/drain`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'surveys'] })
      void qc.invalidateQueries({ queryKey: ['surveys'] })
    },
  })
}

export function useCancelSurvey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/surveys/${id}/cancel`, { reason }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'surveys'] })
      void qc.invalidateQueries({ queryKey: ['surveys'] })
    },
  })
}

// ── Fase 2: Convites, Revisão, Sorteio, Entidades, Institutos e Comparador ──

export function useMySurveyInvitations() {
  const enabled = useSurveysEnabled()
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: ['surveys', 'my-invitations', userId],
    queryFn: () => api.get<SurveyInvitationView[]>('/surveys/my-invitations').then((r) => r.data),
    enabled: enabled && !!userId,
    staleTime: 60_000,
  })
}

export function useDeclineInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) => api.post(`/surveys/invitations/${invitationId}/decline`).then((r) => r.data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['surveys'] }) },
  })
}

export function useReviewSurvey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reviewStatus, reviewNote }: { id: string; reviewStatus: SurveyReviewStatus; reviewNote?: string }) =>
      api.post(`/admin/surveys/${id}/review`, { reviewStatus, reviewNote }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'surveys'] })
      void qc.invalidateQueries({ queryKey: ['surveys'] })
    },
  })
}

export function useDrawSurveySample() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, count, expiresInDays }: { id: string; count: number; expiresInDays?: number }) =>
      api
        .post<{ invited: number; eligiblePoolSize: number; cooldownDays: number }>(`/admin/surveys/${id}/draw-sample`, {
          count,
          expiresInDays,
        })
        .then((r) => r.data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin', 'surveys'] }) },
  })
}

export function useAdminInstitutes(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'surveys', 'institutes'],
    queryFn: () => api.get<ResearchInstituteView[]>('/admin/surveys/institutes').then((r) => r.data),
    enabled,
  })
}

export function useCreateInstitute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      name: string
      legalName: string
      cnpj?: string
      website?: string
      description?: string
      statisticianLead?: string
      conreLead?: string
    }) => api.post('/admin/surveys/institutes', payload).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'surveys', 'institutes'] })
      void qc.invalidateQueries({ queryKey: ['surveys', 'institutes'] })
    },
  })
}

export function useInstituteProfile(slug: string | undefined) {
  const enabled = useSurveysEnabled()
  return useQuery({
    queryKey: ['surveys', 'institute', slug],
    queryFn: () =>
      api.get<{ institute: ResearchInstituteView; surveys: SurveySummaryView[] }>(`/surveys/institutes/${slug}`).then((r) => r.data),
    enabled: enabled && !!slug,
  })
}

export function useSurveyComparison(topicKey: string | null | undefined) {
  const enabled = useSurveysEnabled()
  return useQuery({
    queryKey: ['surveys', 'compare', topicKey],
    queryFn: () =>
      api.get<SurveyComparisonItem[]>('/surveys/compare', { params: { topicKey } }).then((r) => r.data),
    enabled: enabled && !!topicKey,
  })
}

export function useEntitySurveys(entityId: string | undefined) {
  return useQuery({
    queryKey: ['surveys', 'entity', entityId],
    queryFn: () => api.get<AdminSurveyRow[]>(`/surveys/entity/${entityId}`).then((r) => r.data),
    enabled: !!entityId,
  })
}

export function useSubmitEntitySurvey(entityId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      title: string
      subtitle?: string
      description: string
      endsAt?: string
      questions: CreateSurveyPayload['questions']
    }) => api.post(`/surveys/entity/${entityId}/submit`, payload).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['surveys', 'entity', entityId] })
    },
  })
}
