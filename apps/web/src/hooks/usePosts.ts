import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PostCommentMediaType, PostKind } from '@votz/shared-types'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import {
  FeedSortMode,
  GifSearchResponse,
  PostCommentDto,
  PostDto,
  PostPollDto,
  PostsResponse,
} from '../types/api'

export interface UsePostsParams {
  sort?: FeedSortMode
  topic?: string
  city?: string
  state?: string
  kind?: PostKind
  authorType?: 'CITIZEN' | 'POLITICIAN' | 'ENTITY'
  authorUserId?: string
  profileUserId?: string
  authorOrgId?: string
  hasPoll?: boolean
  page?: number
  limit?: number
  enabled?: boolean
}

export function usePostsFeed(params: UsePostsParams = {}) {
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const { enabled = true, ...query } = params
  return useQuery({
    queryKey: ['posts', query],
    queryFn: () =>
      api
        .get<PostsResponse>('/posts', { params: { ...query, limit: query.limit ?? 20 } })
        .then((r) => r.data),
    enabled: enabled && sessionReady,
    staleTime: 20_000,
  })
}

export function usePost(id: string) {
  const sessionReady = useAuthStore((s) => s.sessionReady)
  return useQuery({
    queryKey: ['post', id],
    queryFn: () => api.get<PostDto>(`/posts/${id}`).then((r) => r.data),
    enabled: !!id && sessionReady,
  })
}

export interface CreatePostPayload {
  content?: string
  media?: string[]
  city?: string
  state?: string
  mentionedReportId?: string
  mentionedDebateId?: string
  mentionedPropostaId?: string
  mentionedDebatePollId?: string
  quotePostId?: string
  poll?: {
    question?: string
    options: string[]
    durationHours?: number
  }
}

export function useCreatePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePostPayload) =>
      api.post<PostDto>('/posts', payload).then((r) => r.data),
    onSuccess: (created) => {
      qc.setQueryData<PostDto>(['post', created.id], created)
      void qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['topics'] })
    },
  })
}

export function useDeletePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: string) => api.delete(`/posts/${postId}`).then((r) => r.data),
    onSuccess: (_data, postId) => {
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['post', postId] })
    },
  })
}

export function useTogglePostLike() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: string) =>
      api.post<{ liked: boolean; likesCount: number }>(`/posts/${postId}/like`).then((r) => r.data),
    onSuccess: (res, postId) => {
      qc.setQueriesData<PostsResponse>({ queryKey: ['posts'] }, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map((p) =>
            p.id === postId ? { ...p, likedByMe: res.liked, likesCount: res.likesCount } : p,
          ),
        }
      })
      qc.setQueryData<PostDto>(['post', postId], (old) =>
        old ? { ...old, likedByMe: res.liked, likesCount: res.likesCount } : old,
      )
    },
  })
}

export function useTogglePostRepost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: string) =>
      api
        .post<{ reposted: boolean; repostsCount: number }>(`/posts/${postId}/repost`)
        .then((r) => r.data),
    onSuccess: (res, postId) => {
      qc.setQueriesData<PostsResponse>({ queryKey: ['posts'] }, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map((p) =>
            p.id === postId ? { ...p, repostedByMe: res.reposted, repostsCount: res.repostsCount } : p,
          ),
        }
      })
      qc.setQueryData<PostDto>(['post', postId], (old) =>
        old ? { ...old, repostedByMe: res.reposted, repostsCount: res.repostsCount } : old,
      )
      void qc.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}

export function useVotePostPoll(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (optionId: string) =>
      api.post<PostPollDto>(`/posts/${postId}/poll/vote`, { optionId }).then((r) => r.data),
    onSuccess: (poll) => {
      qc.setQueriesData<PostsResponse>({ queryKey: ['posts'] }, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map((p) => (p.id === postId ? { ...p, poll } : p)),
        }
      })
      qc.setQueryData<PostDto>(['post', postId], (old) => (old ? { ...old, poll } : old))
    },
  })
}

export function useVoteDebatePollInline(postId: string, debateId: string, pollId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (optionId: string) =>
      api.post(`/debates/${debateId}/polls/${pollId}/vote`, { optionId }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['post', postId] })
    },
  })
}

export function useUploadPostMedia() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const r = await api.post<{ key: string; url: string; mimeType: string; size: number }>(
        '/storage/upload/post-media',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return r.data
    },
  })
}

export function usePostComments(postId: string, enabled = true) {
  return useQuery({
    queryKey: ['post-comments', postId],
    queryFn: () => api.get<PostCommentDto[]>(`/posts/${postId}/comments`).then((r) => r.data),
    enabled: !!postId && enabled,
    staleTime: 10_000,
  })
}

export interface CreatePostCommentPayload {
  content?: string
  parentId?: string
  mediaType?: PostCommentMediaType
  mediaUrl?: string
  mediaKey?: string
  mediaDuration?: number
}

export function useCreatePostComment(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePostCommentPayload) =>
      api.post<PostCommentDto>(`/posts/${postId}/comments`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['post-comments', postId] })
      qc.invalidateQueries({ queryKey: ['post', postId] })
      qc.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}

export function useDeletePostComment(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/posts/${postId}/comments/${commentId}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['post-comments', postId] })
      qc.invalidateQueries({ queryKey: ['post', postId] })
      qc.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}

export function useUploadPostCommentMedia() {
  return useMutation({
    mutationFn: async (file: File | Blob) => {
      const form = new FormData()
      if (file instanceof File) {
        form.append('file', file)
      } else {
        const ext = file.type.includes('mp4') ? 'mp4' : file.type.includes('ogg') ? 'ogg' : 'webm'
        form.append('file', file, `voice-${Date.now()}.${ext}`)
      }
      const r = await api.post<{ key: string; url: string; mimeType: string; size: number }>(
        '/storage/upload/post-comment-media',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return r.data
    },
  })
}

export function useGifSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['gifs', q],
    queryFn: () =>
      api
        .get<GifSearchResponse>('/gifs/search', { params: { q, limit: 18 } })
        .then((r) => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useAdvocateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: {
      actorType: 'POLITICIAN' | 'ENTITY'
      actorId: string
      reportId: string
      publishToFeed?: boolean
      postContent?: string
      media?: string[]
    }) => {
      const base = vars.actorType === 'POLITICIAN' ? 'politicians' : 'entities'
      return api
        .post<{ advocated: boolean; postId?: string }>(
          `/${base}/${vars.actorId}/advocate/${vars.reportId}`,
          {
            publishToFeed: vars.publishToFeed,
            postContent: vars.postContent,
            media: vars.media,
          },
        )
        .then((r) => r.data)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['reports'] })
      qc.invalidateQueries({ queryKey: ['report', vars.reportId] })
      if (vars.publishToFeed) {
        qc.invalidateQueries({ queryKey: ['posts'] })
      }
    },
  })
}
