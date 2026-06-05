import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Debate, DebateMessage, DebatePoll, DebateQuestion, DebatesResponse } from '../types/api'

interface UseDebatesParams {
  status?: string
  politicianId?: string
  upcoming?: boolean
  page?: number
  enabled?: boolean
}

export function useDebates(params: UseDebatesParams = {}) {
  const { enabled = true, ...queryParams } = params
  return useQuery({
    queryKey: ['debates', queryParams],
    queryFn: () =>
      api.get<DebatesResponse>('/debates', { params: { ...queryParams, limit: 20 } }).then((r) => r.data),
    staleTime: 30_000,
    enabled,
  })
}

export function useDebate(id: string) {
  return useQuery({
    queryKey: ['debate', id],
    queryFn: () => api.get<Debate>(`/debates/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function useCreateDebate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      title: string
      description?: string
      scheduledFor: string
      invites: string[]
    }) => api.post<Debate>('/debates', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debates'] })
    },
  })
}

export function useStartDebate(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<Debate>(`/debates/${id}/start`).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['debate', id], data)
    },
  })
}

export function useEndDebate(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<Debate>(`/debates/${id}/end`).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['debate', id], data)
      qc.invalidateQueries({ queryKey: ['debates'] })
    },
  })
}

export function useRespondInvite(debateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ politicianId, accept }: { politicianId: string; accept: boolean }) =>
      api
        .post(`/debates/${debateId}/invite/${politicianId}/respond`, { accept })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debate', debateId] })
    },
  })
}

export function useDebateLivekitToken(id: string, enabled = false) {
  return useQuery({
    queryKey: ['debate-livekit-token', id],
    queryFn: () => api.get<{ token: string; canPublish: boolean }>(`/debates/${id}/token`).then((r) => r.data),
    enabled: !!id && enabled,
    staleTime: 3 * 60 * 60_000,
    gcTime: 4 * 60 * 60_000,
  })
}

export function useDebateMessages(debateId: string) {
  return useQuery({
    queryKey: ['debate-messages', debateId],
    queryFn: () => api.get<DebateMessage[]>(`/debates/${debateId}/messages`).then((r) => r.data),
    enabled: !!debateId,
    staleTime: Infinity,
  })
}

export function useDebateActivePoll(debateId: string) {
  return useQuery({
    queryKey: ['debate-poll-active', debateId],
    queryFn: () => api.get<DebatePoll | null>(`/debates/${debateId}/polls/active`).then((r) => r.data),
    enabled: !!debateId,
    staleTime: 30_000,
  })
}

export function useIsFollowingPolitician(politicianId: string, enabled = false) {
  return useQuery({
    queryKey: ['is-following', politicianId],
    queryFn: () =>
      api.get<{ following: boolean }>(`/politicians/${politicianId}/is-following`).then((r) => r.data),
    enabled: !!politicianId && enabled,
    staleTime: 5 * 60_000,
  })
}

export function useSubmitQuestion(debateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) =>
      api.post<DebateQuestion>(`/debates/${debateId}/questions`, { text }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debate-questions', debateId] })
    },
  })
}

export function useUpvoteQuestion(debateId: string) {
  return useMutation({
    mutationFn: (questionId: string) =>
      api.post<DebateQuestion>(`/debates/${debateId}/questions/${questionId}/upvote`).then((r) => r.data),
  })
}

export function useDebateQuestions(debateId: string, isLive: boolean) {
  return useQuery({
    queryKey: ['debate-questions', debateId],
    queryFn: () => api.get<DebateQuestion[]>(`/debates/${debateId}/questions`).then((r) => r.data),
    enabled: !!debateId,
    staleTime: 15_000,
    refetchInterval: isLive ? 15_000 : false,
  })
}

export function useCreatePoll(debateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { question: string; options: string[] }) =>
      api.post<DebatePoll>(`/debates/${debateId}/polls`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debate', debateId] })
    },
  })
}

export function useVotePoll(debateId: string) {
  return useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) =>
      api.post<DebatePoll>(`/debates/${debateId}/polls/${pollId}/vote`, { optionId }).then((r) => r.data),
  })
}

export function useFollowPolitician() {
  return useMutation({
    mutationFn: (politicianId: string) =>
      api.post<{ following: boolean }>(`/politicians/${politicianId}/follow`).then((r) => r.data),
  })
}
