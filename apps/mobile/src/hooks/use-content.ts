import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FeedSortMode, PostCommentDto } from '@votz/shared-types'
import { api, json } from '../lib/api'
import type { Page, PostDto, ProfileKind, PublicProfile, Report, ReportSummary, ReportComment } from '../lib/types'

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
export function useComments(id: string, kind: 'posts' | 'reports' = 'posts') {
  return useQuery({ queryKey: ['comments', kind, id], queryFn: ({ signal }) => api<(PostCommentDto | ReportComment)[]>(`/${kind}/${id}/comments`, { signal }) })
}
export function useComment(id: string, kind: 'posts' | 'reports' = 'posts') {
  const client = useQueryClient()
  return useMutation({ mutationFn: (body: { content: string; parentId?: string }) => api(`/${kind}/${id}/comments`, json(body)), onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['comments', kind, id] }), client.invalidateQueries({ queryKey: [kind] })])
  } })
}
export function useCreateContent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, body }: { kind: 'posts' | 'reports'; body: unknown }) => api<PostDto | Report>(`/${kind}`, json(body)),
    onSuccess: async (_data, { kind }) => {
      await client.invalidateQueries({ queryKey: [kind] })
      if (kind === 'reports') await client.invalidateQueries({ queryKey: ['profile-reports'] })
    },
  })
}

export function useProfilePosts(kind: ProfileKind, id: string) {
  return useInfiniteQuery({
    queryKey: ['posts', 'profile', kind, id], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api<Page<PostDto>>(`/posts?${kind === 'users' ? 'authorUserId' : 'authorOrgId'}=${encodeURIComponent(id)}&sort=recent&page=${pageParam}&limit=15`, { signal }),
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  })
}
export function useProfileReports(kind: ProfileKind, id: string) {
  return useInfiniteQuery({
    queryKey: ['profile-reports', kind, id], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api<Page<ReportSummary>>(`/${kind}/${id}/reports?page=${pageParam}&limit=15`, { signal }),
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  })
}
