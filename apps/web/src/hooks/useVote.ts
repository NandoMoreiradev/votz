import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { VoteType } from '@votz/shared-types'

export function useVote(reportId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (type: VoteType) =>
      api.post(`/reports/${reportId}/votes`, { type }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report', reportId] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
