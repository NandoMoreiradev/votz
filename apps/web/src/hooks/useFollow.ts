import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

export function useIsFollowingTarget(
  targetType: 'USER' | 'POLITICIAN' | 'ENTITY',
  targetId?: string,
) {
  const user = useAuthStore((s) => s.user)
  const path =
    targetType === 'POLITICIAN'
      ? `/politicians/${targetId}/is-following`
      : targetType === 'ENTITY'
        ? `/entities/${targetId}/is-following`
        : `/users/${targetId}/is-following`

  return useQuery({
    queryKey: ['follow', targetType, targetId, user?.id],
    queryFn: () => api.get<{ following: boolean }>(path).then((r) => r.data),
    enabled: !!user && !!targetId && (targetType !== 'USER' || user.id !== targetId),
    staleTime: 30_000,
  })
}

export function useToggleFollowTarget(
  targetType: 'USER' | 'POLITICIAN' | 'ENTITY',
  targetId?: string,
) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const path =
    targetType === 'POLITICIAN'
      ? `/politicians/${targetId}/follow`
      : targetType === 'ENTITY'
        ? `/entities/${targetId}/follow`
        : `/users/${targetId}/follow`

  return useMutation({
    mutationFn: () => api.post<{ following: boolean }>(path).then((r) => r.data),
    onSuccess: (res) => {
      qc.setQueryData(['follow', targetType, targetId, user?.id], res)
      qc.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}
