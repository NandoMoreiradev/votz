import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Report } from '../types/api'
import { VoteType } from '@votz/shared-types'
import { useAuthStore } from '../store/auth.store'

interface MyVotes {
  SUPPORT: boolean
  ME_TOO: boolean
}

export function useMyVotes(reportId: string) {
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  return useQuery({
    queryKey: ['my-votes', reportId],
    queryFn: () =>
      api.get<MyVotes>(`/reports/${reportId}/votes/me`).then((r) => r.data),
    enabled: !!user && !!reportId && sessionReady,
    staleTime: 60_000,
  })
}

export function useVote(reportId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (type: VoteType) =>
      api
        .post<{ voted: boolean; type: VoteType }>(`/reports/${reportId}/votes`, { type })
        .then((r) => r.data),

    onMutate: async (type) => {
      await qc.cancelQueries({ queryKey: ['report', reportId] })
      await qc.cancelQueries({ queryKey: ['my-votes', reportId] })

      const prevReport = qc.getQueryData<Report>(['report', reportId])
      const prevMyVotes = qc.getQueryData<MyVotes>(['my-votes', reportId])

      const wasVoted = prevMyVotes?.[type] ?? false
      const delta = wasVoted ? -1 : 1
      const countKey = type === VoteType.SUPPORT ? 'votes' : 'meTooVotes'

      if (prevReport) {
        qc.setQueryData<Report>(['report', reportId], {
          ...prevReport,
          _count: { ...prevReport._count, [countKey]: prevReport._count[countKey] + delta },
        })
      }

      if (prevMyVotes) {
        qc.setQueryData<MyVotes>(['my-votes', reportId], {
          ...prevMyVotes,
          [type]: !wasVoted,
        })
      }

      return { prevReport, prevMyVotes }
    },

    onError: (_err, _type, ctx) => {
      if (ctx?.prevReport) qc.setQueryData(['report', reportId], ctx.prevReport)
      if (ctx?.prevMyVotes) qc.setQueryData(['my-votes', reportId], ctx.prevMyVotes)
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['report', reportId] })
      qc.invalidateQueries({ queryKey: ['my-votes', reportId] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
