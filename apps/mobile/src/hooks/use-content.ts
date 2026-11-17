import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FeedSortMode, PostCommentDto } from '@votz/shared-types'
import { api, json } from '../lib/api'
import type { Page, PostDto, ProfileKind, PublicProfile, Report } from '../lib/types'

export function useFeed<T>(kind: 'posts' | 'reports', sort: FeedSortMode = 'recent') {
  return useInfiniteQuery({
    queryKey: [kind, 'feed', sort], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api<Page<T>>(`/${kind}?page=${pageParam}&limit=15${kind === 'posts' ? `&sort=${sort}` : ''}`, { signal }),
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  })
}
export function useDetail<T>(kind: string, id: string) {
  return useQuery({ queryKey: [kind, id], queryFn: ({ signal }) => api<T>(`/${kind}/${id}`, { signal }), enabled: !!id })
}
export function useAction(path: string, invalidate: string[], body?: unknown) {
  const client = useQueryClient()
  return useMutation({ mutationFn: () => api(path, json(body)), onSuccess: async () => {
    await Promise.all(invalidate.map((key) => client.invalidateQueries({ queryKey: [key] })))
  } })
}
export function useDirectory(kind: 'politicians' | 'entities', search: string) {
  return useInfiniteQuery({
    queryKey: [kind, 'directory', search], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api<Page<PublicProfile>>(`/${kind}?page=${pageParam}&limit=20&search=${encodeURIComponent(search)}`, { signal }),
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  })
}
export function useFollowing(kind: ProfileKind, id: string, enabled: boolean) {
  return useQuery({ queryKey: ['following', kind, id], queryFn: () => api<{ following: boolean }>(`/${kind}/${id}/is-following`), enabled })
}
export function useToggleFollow(kind: ProfileKind, id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ following: boolean }>(`/${kind}/${id}/follow`, json({})),
    onSuccess: (data) => {
      client.setQueryData(['following', kind, id], data)
      void client.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}
export function useComments(postId: string) {
  return useQuery({ queryKey: ['post-comments', postId], queryFn: () => api<PostCommentDto[]>(`/posts/${postId}/comments`) })
}
export function useComment(postId: string) {
  const client = useQueryClient()
  return useMutation({ mutationFn: (content: string) => api(`/posts/${postId}/comments`, json({ content })), onSuccess: async () => {
    await Promise.all(['post-comments', 'posts'].map((key) => client.invalidateQueries({ queryKey: [key] })))
  } })
}
export function useCreateContent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, body }: { kind: 'posts' | 'reports'; body: unknown }) => api<PostDto | Report>(`/${kind}`, json(body)),
    onSuccess: async (_data, { kind }) => { await client.invalidateQueries({ queryKey: [kind] }) },
  })
}
