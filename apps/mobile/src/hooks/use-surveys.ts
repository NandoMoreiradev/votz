import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SurveyDetailView,
  SurveyInvitationView,
  SurveyKind,
  SurveyResultsView,
  SurveyStatus,
  SurveySummaryView,
} from '@votz/shared-types'
import { api, json } from '../lib/api'
import { useSession } from '../lib/session'

export function useSurveysEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['surveys', 'config'],
    queryFn: ({ signal }) => api<{ enabled: boolean; electoralLockEnabled: boolean }>('/surveys/config', { signal }),
    staleTime: 10 * 60_000,
    retry: false,
  })
  return data?.enabled === true
}

export function usePublicSurveys(status: SurveyStatus, kind?: SurveyKind) {
  const enabled = useSurveysEnabled()
  const userId = useSession((s) => s.user?.id)
  const qs = new URLSearchParams({ status })
  if (kind) qs.set('kind', kind)
  return useQuery({
    queryKey: ['surveys', 'list', status, kind ?? 'all', userId ?? 'anon'],
    queryFn: ({ signal }) => api<SurveySummaryView[]>(`/surveys?${qs.toString()}`, { signal }),
    enabled,
    staleTime: 60_000,
  })
}

export function useFeaturedSurveys() {
  const enabled = useSurveysEnabled()
  const userId = useSession((s) => s.user?.id)
  return useQuery({
    queryKey: ['surveys', 'featured', userId ?? 'anon'],
    queryFn: ({ signal }) => api<SurveySummaryView[]>('/surveys/featured', { signal }),
    enabled,
    staleTime: 2 * 60_000,
  })
}

export function useSurveyDetail(slug: string | undefined) {
  const enabled = useSurveysEnabled()
  const userId = useSession((s) => s.user?.id)
  return useQuery({
    queryKey: ['surveys', 'detail', slug, userId ?? 'anon'],
    queryFn: ({ signal }) => api<SurveyDetailView>(`/surveys/${slug}`, { signal }),
    enabled: enabled && !!slug,
    staleTime: 30_000,
  })
}

export function useSurveyResults(slug: string | undefined, segment = 'ALL', allow = true) {
  const enabled = useSurveysEnabled()
  return useQuery({
    queryKey: ['surveys', 'results', slug, segment],
    queryFn: ({ signal }) =>
      api<SurveyResultsView>(`/surveys/${slug}/results?segment=${encodeURIComponent(segment)}`, { signal }),
    enabled: enabled && allow && !!slug,
    staleTime: 30_000,
  })
}

export function useSubmitSurveyVote(surveyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (answers: Record<string, string[]>) =>
      api<{ recorded: boolean; anonymous: boolean; message: string }>(`/surveys/${surveyId}/vote`, json({ answers })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['surveys'] })
    },
  })
}

export function useMySurveyInvitations() {
  const enabled = useSurveysEnabled()
  const userId = useSession((s) => s.user?.id)
  return useQuery({
    queryKey: ['surveys', 'my-invitations', userId],
    queryFn: ({ signal }) => api<SurveyInvitationView[]>('/surveys/my-invitations', { signal }),
    enabled: enabled && !!userId,
    staleTime: 60_000,
  })
}
