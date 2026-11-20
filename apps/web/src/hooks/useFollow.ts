import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

export type FollowTargetType = 'USER' | 'POLITICIAN' | 'ENTITY' | 'COMPANY'

const BASE: Record<FollowTargetType, string> = {
  USER: 'users',
  POLITICIAN: 'politicians',
  ENTITY: 'entities',
  COMPANY: 'companies',
}
/** Chave da consulta do perfil, onde mora o contador de seguidores. */
const PROFILE_KEY: Record<FollowTargetType, string> = {
  USER: 'user',
  POLITICIAN: 'politician',
  ENTITY: 'entity',
  COMPANY: 'company',
}

export function useIsFollowingTarget(targetType: FollowTargetType, targetId?: string) {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['follow', targetType, targetId, user?.id],
    queryFn: () =>
      api.get<{ following: boolean }>(`/${BASE[targetType]}/${targetId}/is-following`).then((r) => r.data),
    enabled: !!user && !!targetId && (targetType !== 'USER' || user.id !== targetId),
    staleTime: 30_000,
  })
}

export function useToggleFollowTarget(targetType: FollowTargetType, targetId?: string) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const key = ['follow', targetType, targetId, user?.id]
  const profileKey = [PROFILE_KEY[targetType], targetId]

  const setCount = (delta: number) =>
    qc.setQueryData(profileKey, (old: unknown) => {
      if (!old || typeof old !== 'object') return old
      const current = (old as { followersCount?: number }).followersCount
      return typeof current === 'number' ? { ...old, followersCount: Math.max(0, current + delta) } : old
    })

  return useMutation({
    mutationFn: () =>
      api.post<{ following: boolean }>(`/${BASE[targetType]}/${targetId}/follow`).then((r) => r.data),
    // O botão e o número de seguidores mudam na hora; voltam ao que eram se o servidor recusar.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<{ following: boolean }>(key)
      qc.setQueryData(key, { following: !previous?.following })
      setCount(previous?.following ? -1 : 1)
      return { previous }
    },
    onError: (_error, _vars, context) => {
      qc.setQueryData(key, context?.previous)
      setCount(context?.previous?.following ? 1 : -1)
    },
    onSuccess: (res, _vars, context) => {
      qc.setQueryData(key, res)
      // Se o servidor discordou do palpite, corrige o contador.
      if (res.following !== !context?.previous?.following) setCount(res.following ? 1 : -1)
      qc.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}
