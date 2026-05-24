import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Comment } from '../types/api'
import { useAuthStore } from '../store/auth.store'

export function useComments(reportId: string) {
  return useQuery({
    queryKey: ['comments', reportId],
    queryFn: () => api.get<Comment[]>(`/reports/${reportId}/comments`).then((r) => r.data),
    enabled: !!reportId,
    staleTime: 15_000,
  })
}

export function useCreateComment(reportId: string) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)

  return useMutation({
    mutationFn: (data: { content: string; parentId?: string }) =>
      api.post<Comment>(`/reports/${reportId}/comments`, data).then((r) => r.data),

    onMutate: async (data) => {
      if (!user) return

      await qc.cancelQueries({ queryKey: ['comments', reportId] })
      const prev = qc.getQueryData<Comment[]>(['comments', reportId])

      const now = new Date().toISOString()
      const optimistic: Comment = {
        id: `__opt__${Date.now()}`,
        content: data.content,
        parentId: data.parentId ?? null,
        createdAt: now,
        updatedAt: now,
        author: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
        _count: { replies: 0 },
        replies: [],
      }

      qc.setQueryData<Comment[]>(['comments', reportId], (old = []) => {
        if (data.parentId) {
          return old.map((c) =>
            c.id === data.parentId
              ? { ...c, replies: [...(c.replies ?? []), optimistic] }
              : c,
          )
        }
        return [...old, optimistic]
      })

      return { prev }
    },

    onError: (_err, _data, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(['comments', reportId], ctx.prev)
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['comments', reportId] })
      qc.invalidateQueries({ queryKey: ['report', reportId] })
    },
  })
}

export function useEditComment(reportId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      api.patch<Comment>(`/reports/${reportId}/comments/${commentId}`, { content }).then((r) => r.data),

    onMutate: async ({ commentId, content }) => {
      await qc.cancelQueries({ queryKey: ['comments', reportId] })
      const prev = qc.getQueryData<Comment[]>(['comments', reportId])

      const patchContent = (c: Comment): Comment =>
        c.id === commentId ? { ...c, content, updatedAt: new Date().toISOString() } : c

      qc.setQueryData<Comment[]>(['comments', reportId], (old = []) =>
        old.map((c) => ({ ...patchContent(c), replies: c.replies?.map(patchContent) ?? [] })),
      )

      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['comments', reportId], ctx.prev)
    },

    onSettled: () => qc.invalidateQueries({ queryKey: ['comments', reportId] }),
  })
}

export function useDeleteComment(reportId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/reports/${reportId}/comments/${commentId}`),

    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: ['comments', reportId] })
      const prev = qc.getQueryData<Comment[]>(['comments', reportId])

      qc.setQueryData<Comment[]>(['comments', reportId], (old = []) =>
        old
          .filter((c) => c.id !== commentId)
          .map((c) => ({
            ...c,
            replies: c.replies?.filter((r) => r.id !== commentId) ?? [],
          })),
      )

      return { prev }
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(['comments', reportId], ctx.prev)
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['comments', reportId] })
    },
  })
}
