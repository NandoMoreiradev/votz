import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from '../lib/api'
import { useSession } from '../lib/session'
import type {
  MyProfilesResponse,
  ReportFollowersResponse,
  SwitchContextResponse,
} from '../lib/types'

export function useMyProfiles(enabled = true) {
  const user = useSession((s) => s.user)
  return useQuery<MyProfilesResponse>({
    queryKey: ['my-profiles', user?.id],
    queryFn: ({ signal }) => api<MyProfilesResponse>('/auth/my-profiles', { signal }),
    enabled: !!user && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useSwitchContext() {
  const applyContext = useSession((s) => s.applyContext)
  return useMutation({
    mutationFn: (body: { contextType: 'personal' | 'politician' | 'entity' | 'company'; contextId?: string; mfaCode?: string }) =>
      api<SwitchContextResponse>('/auth/switch-context', json(body)),
    onSuccess: (data) => {
      if ('accessToken' in data) {
        applyContext(data.accessToken, data.ctx)
      }
    },
  })
}

export function useVoteReport(reportId: string, userId?: string) {
  const client = useQueryClient()
  const votesKey = ['report-votes', reportId, userId]
  return useMutation<{ voted: boolean }, Error, 'SUPPORT' | 'ME_TOO'>({
    mutationFn: (type) => api(`/reports/${reportId}/votes`, json({ type })),
    onSuccess: (result, type) => {
      client.setQueryData<{ SUPPORT: boolean; ME_TOO: boolean }>(votesKey, (old) => ({
        SUPPORT: old?.SUPPORT ?? false,
        ME_TOO: old?.ME_TOO ?? false,
        [type]: result.voted,
      }))
      void client.invalidateQueries({ queryKey: ['reports', reportId] })
      void client.invalidateQueries({ queryKey: ['reports'] })
      void client.invalidateQueries({ queryKey: ['profile-reports'] })
    },
  })
}

export function useDisputeReport(reportId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { reason: string; evidence?: string[] }) =>
      api(`/reports/${reportId}/dispute`, json(body)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['reports', reportId] })
      void client.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export function useUpdateReportStatus(reportId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { status?: string; content: string; media?: string[]; noEvidence?: boolean; archiveReason?: string }) =>
      api(`/reports/${reportId}/status`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['reports', reportId] })
      void client.invalidateQueries({ queryKey: ['reports'] })
      void client.invalidateQueries({ queryKey: ['profile-reports'] })
    },
  })
}

export function useAdvocateReport(reportId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: {
      actorType: 'POLITICIAN' | 'ENTITY'
      actorId: string
      publishToFeed?: boolean
      postContent?: string
      /** Prazo prometido para a solução, em dias. */
      promisedInDays?: number
    }) => {
      const base = vars.actorType === 'POLITICIAN' ? 'politicians' : 'entities'
      return api<{ advocated: boolean; postId?: string }>(
        `/${base}/${vars.actorId}/advocate/${reportId}`,
        json({
          publishToFeed: vars.publishToFeed,
          postContent: vars.postContent,
          promisedInDays: vars.promisedInDays,
        }),
      )
    },
    onSuccess: (_data, vars) => {
      void client.invalidateQueries({ queryKey: ['reports', reportId] })
      void client.invalidateQueries({ queryKey: ['reports'] })
      if (vars.publishToFeed) {
        void client.invalidateQueries({ queryKey: ['posts'] })
      }
    },
  })
}

/** Autor confirma que o problema foi resolvido (pesa no Mandatômetro). */
export function useConfirmResolution(reportId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api(`/reports/${reportId}/confirm-resolution`, { method: 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['reports', reportId] })
    },
  })
}

/** Desistir da avocação: público, com motivo. */
export function useWithdrawAdvocacy(reportId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => api(`/reports/${reportId}/advocacy/withdraw`, json({ reason })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['reports', reportId] })
      void client.invalidateQueries({ queryKey: ['reports'] })
      void client.invalidateQueries({ queryKey: ['report-followers', reportId] })
    },
  })
}

export function useReportFollowers(reportId: string) {
  return useQuery<ReportFollowersResponse>({
    queryKey: ['report-followers', reportId],
    queryFn: ({ signal }) => api<ReportFollowersResponse>(`/reports/${reportId}/followers`, { signal }),
    enabled: !!reportId,
    retry: false,
  })
}

export function useReportFollowStatus(reportId: string, enabled: boolean) {
  return useQuery<{ following: boolean }>({
    queryKey: ['report-follow-status', reportId],
    queryFn: ({ signal }) => api<{ following: boolean }>(`/reports/${reportId}/follow/me`, { signal }),
    enabled: !!reportId && enabled,
    retry: false,
  })
}

export function useToggleFollowReport(reportId: string) {
  const client = useQueryClient()
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['report-follow-status', reportId] })
    void client.invalidateQueries({ queryKey: ['report-followers', reportId] })
  }
  const follow = useMutation({
    mutationFn: () => api(`/reports/${reportId}/follow`, json({})),
    onSuccess: invalidate,
  })
  const unfollow = useMutation({
    mutationFn: () => api(`/reports/${reportId}/follow`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  return { follow, unfollow }
}
