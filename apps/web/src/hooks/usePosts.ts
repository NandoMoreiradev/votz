import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PostCommentMediaType, PostKind, UserType, type MediaCrop, type MediaFormat } from '@votz/shared-types'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { api } from '../lib/api'
import { uploadPostMedia } from '../lib/post-media-upload'
import { useAuthStore, useViewerCacheScope } from '../store/auth.store'
import {
  FeedSortMode,
  GifSearchResponse,
  PostCommentDto,
  PostDto,
  PostPollDto,
  PostsResponse,
} from '../types/api'
import type { FeedSuggestedProfile } from '@votz/shared-types'

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

type CachedPosts = PostsResponse | InfiniteData<PostsResponse>

function updatePostPages(old: CachedPosts | undefined, update: (page: PostsResponse) => PostsResponse): CachedPosts | undefined {
  if (!old) return old
  if ('pages' in old) return { ...old, pages: old.pages.map(update) }
  return Array.isArray(old.data) ? update(old) : old
}

/**
 * Atualização otimista dos posts: muda o item em todas as listas e na tela do post antes de o servidor
 * responder e devolve a função que desfaz, caso o servidor recuse.
 */
function patchPost(qc: QueryClient, scope: ReturnType<typeof useViewerCacheScope>, postId: string, change: (post: PostDto) => PostDto): () => void {
  const lists = qc.getQueriesData<CachedPosts>({ queryKey: ['posts', scope] })
  const single = qc.getQueryData<PostDto>(['post', postId, scope])
  qc.setQueriesData<CachedPosts>({ queryKey: ['posts', scope] }, (old) =>
    updatePostPages(old, (page) => ({ ...page, data: page.data.map((p) => p.id === postId ? change(p) : p) })),
  )
  qc.setQueryData<PostDto>(['post', postId, scope], (old) => (old ? change(old) : old))
  return () => {
    lists.forEach(([key, data]) => qc.setQueryData(key, data))
    qc.setQueryData(['post', postId, scope], single)
  }
}

/** Um post novo entra no topo das listas a que ele pertence, sem esperar a lista recarregar. */
function feedAccepts(filters: Record<string, unknown>, post: PostDto): boolean {
  if (typeof filters.page === 'number' && filters.page > 1) return false
  if (filters.topic || filters.kind) return false
  if (filters.hasPoll && !post.poll) return false
  if (filters.authorUserId && filters.authorUserId !== post.author.userId) return false
  if (filters.profileUserId && filters.profileUserId !== post.author.userId) return false
  if (filters.authorOrgId && filters.authorOrgId !== post.author.orgId) return false
  if (filters.authorType && filters.authorType !== (post.author.orgType ?? 'CITIZEN')) return false
  if (filters.city || filters.state) return false
  return true
}

export function usePostsFeed(params: UsePostsParams = {}) {
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const scope = useViewerCacheScope()
  const { enabled = true, ...query } = params
  return useQuery({
    queryKey: ['posts', scope, query],
    queryFn: ({ signal }) =>
      api
        .get<PostsResponse>('/posts', { params: { ...query, limit: query.limit ?? 20 }, signal })
        .then((r) => r.data),
    enabled: enabled && sessionReady,
    staleTime: 20_000,
  })
}

/** A página inicial usa a sequência do servidor. Perfis e clientes antigos ainda podem usar page. */
export function useInfinitePostsFeed(params: Omit<UsePostsParams, 'page'>) {
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const scope = useViewerCacheScope()
  const qc = useQueryClient()
  const { enabled = true, ...query } = params
  const queryKey = ['posts', scope, 'scroll', query] as const
  const feed = useInfiniteQuery({
    queryKey,
    initialPageParam: 'start',
    queryFn: ({ pageParam, signal }) =>
      api.get<PostsResponse>('/posts', { params: { ...query, limit: query.limit ?? 20, cursor: pageParam }, signal }).then((r) => r.data),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: enabled && sessionReady,
    staleTime: 20_000,
    retry: (count, error) => !(isAxiosError(error) && error.response?.status === 410) && count < 1,
  })
  const pages = feed.data?.pages
  const first = pages?.[0]
  return {
    ...feed,
    data: first && pages ? { ...first, data: pages.flatMap((page) => page.data) } : undefined,
    expired: isAxiosError(feed.error) && feed.error.response?.status === 410,
    restart: () => qc.resetQueries({ queryKey, exact: true }),
  }
}

export function usePost(id: string) {
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const scope = useViewerCacheScope()
  return useQuery({
    queryKey: ['post', id, scope],
    queryFn: ({ signal }) => api.get<PostDto>(`/posts/${id}`, { signal }).then((r) => r.data),
    enabled: !!id && sessionReady,
  })
}

export interface CreatePostPayload {
  content?: string
  /** Envio antigo, sem formato (avocação). Publicações comuns usam `mediaAssets`. */
  media?: string[]
  /** Fotos e vídeos enviados em /media/uploads, com formato e enquadramento (todos no mesmo formato). */
  mediaAssets?: Array<{ id: string; format: MediaFormat; crop?: MediaCrop }>
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
  const scope = useViewerCacheScope()
  return useMutation({
    mutationFn: (payload: CreatePostPayload) =>
      api.post<PostDto>('/posts', payload).then((r) => r.data),
    onMutate: () => ({ scope }),
    onSuccess: (created, _payload, context) => {
      if (!context) return
      qc.setQueryData<PostDto>(['post', created.id, context.scope], created)
      for (const [key, old] of qc.getQueriesData<PostsResponse>({ queryKey: ['posts', context.scope] })) {
        const filters = key[2]
        if (!old || !Array.isArray(old.data) || !filters || typeof filters !== 'object' || !feedAccepts(filters as Record<string, unknown>, created)) continue
        if (old.data.some((p) => p.id === created.id)) continue
        qc.setQueryData<PostsResponse>(key, { ...old, data: [created, ...old.data], meta: { ...old.meta, total: old.meta.total + 1 } })
      }
      void qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['topics'] })
    },
  })
}

export function useDeletePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: string) => api.delete(`/posts/${postId}`).then((r) => r.data),
    // Some da lista na hora; volta se o servidor recusar.
    onMutate: async (postId) => {
      await qc.cancelQueries({ queryKey: ['posts'] })
      const lists = qc.getQueriesData<CachedPosts>({ queryKey: ['posts'] })
      qc.setQueriesData<CachedPosts>({ queryKey: ['posts'] }, (old) =>
        updatePostPages(old, (page) => {
          const data = page.data.filter((p) => p.id !== postId)
          return data.length < page.data.length
            ? { ...page, data, meta: { ...page.meta, total: Math.max(0, page.meta.total - 1) } }
            : page
        }),
      )
      return { lists }
    },
    onError: (_error, _postId, context) => {
      context?.lists.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSuccess: (_data, postId) => {
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['post', postId] })
    },
  })
}

export function useTogglePostLike() {
  const qc = useQueryClient()
  const scope = useViewerCacheScope()
  return useMutation({
    mutationFn: (postId: string) =>
      api.post<{ liked: boolean; likesCount: number }>(`/posts/${postId}/like`).then((r) => r.data),
    onMutate: async (postId) => {
      await qc.cancelQueries({ queryKey: ['posts', scope] })
      const rollback = patchPost(qc, scope, postId, (p) => ({
        ...p,
        likedByMe: !p.likedByMe,
        likesCount: Math.max(0, p.likesCount + (p.likedByMe ? -1 : 1)),
      }))
      return { rollback, scope }
    },
    onError: (_error, _postId, context) => context?.rollback(),
    onSuccess: (res, postId, context) => {
      if (!context) return
      patchPost(qc, context.scope, postId, (p) => ({ ...p, likedByMe: res.liked, likesCount: res.likesCount }))
    },
  })
}

export function useTogglePostRepost() {
  const qc = useQueryClient()
  const scope = useViewerCacheScope()
  return useMutation({
    mutationFn: (postId: string) =>
      api
        .post<{ reposted: boolean; repostsCount: number }>(`/posts/${postId}/repost`)
        .then((r) => r.data),
    onMutate: async (postId) => {
      await qc.cancelQueries({ queryKey: ['posts', scope] })
      const rollback = patchPost(qc, scope, postId, (p) => ({
        ...p,
        repostedByMe: !p.repostedByMe,
        repostsCount: Math.max(0, p.repostsCount + (p.repostedByMe ? -1 : 1)),
      }))
      return { rollback, scope }
    },
    onError: (_error, _postId, context) => context?.rollback(),
    onSuccess: (res, postId, context) => {
      if (!context) return
      patchPost(qc, context.scope, postId, (p) => ({ ...p, repostedByMe: res.reposted, repostsCount: res.repostsCount }))
      void qc.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}

export function useVotePostPoll(postId: string) {
  const qc = useQueryClient()
  const scope = useViewerCacheScope()
  return useMutation({
    mutationFn: (optionId: string) =>
      api.post<PostPollDto>(`/posts/${postId}/poll/vote`, { optionId }).then((r) => r.data),
    // O voto aparece na hora; a apuração do servidor só confirma.
    onMutate: async (optionId) => {
      await qc.cancelQueries({ queryKey: ['posts', scope] })
      const rollback = patchPost(qc, scope, postId, (p) =>
        p.poll
          ? {
              ...p,
              poll: {
                ...p.poll,
                myVoteOptionId: optionId,
                totalVotes: p.poll.totalVotes + 1,
                options: p.poll.options.map((o) => (o.id === optionId ? { ...o, votesCount: o.votesCount + 1 } : o)),
              },
            }
          : p,
      )
      return { rollback, scope }
    },
    onError: (_error, _optionId, context) => context?.rollback(),
    onSuccess: (poll, _optionId, context) => {
      if (!context) return
      patchPost(qc, context.scope, postId, (p) => ({ ...p, poll }))
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

/** Envia foto, GIF ou vídeo de publicação no padrão de formatos (o recorte vai depois, ao publicar). */
export function useUploadMediaAsset() {
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (percent: number) => void }) => uploadPostMedia(file, onProgress),
  })
}

/** Envio antigo, sem formato. Ainda usado na avocação. */
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
  const scope = useViewerCacheScope()
  const user = useAuthStore((s) => s.user)
  const activeContext = useAuthStore((s) => s.activeContext)
  const key = ['post-comments', postId]
  return useMutation({
    mutationFn: (payload: CreatePostCommentPayload) =>
      api.post<PostCommentDto>(`/posts/${postId}/comments`, payload).then((r) => r.data),
    // A resposta aparece na conversa no mesmo instante; se falhar, ela some.
    onMutate: async (payload) => {
      if (!user) return
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<PostCommentDto[]>(key)
      const now = new Date().toISOString()
      const draft: PostCommentDto = {
        id: `__opt__${Date.now()}`,
        postId,
        parentId: payload.parentId ?? null,
        content: payload.content ?? '',
        mediaType: payload.mediaType ?? PostCommentMediaType.TEXT,
        mediaUrl: payload.mediaUrl ?? null,
        mediaDuration: payload.mediaDuration ?? null,
        transcript: null,
        createdAt: now,
        updatedAt: now,
        _count: { replies: 0 },
        author: {
          userId: user.id,
          name: user.name,
          username: user.username ?? null,
          avatarUrl: user.avatarUrl,
          verified: user.verified,
          userType: user.type as UserType,
          orgType: activeContext?.type ?? null,
          orgId: activeContext?.id ?? null,
          orgName: activeContext?.name ?? null,
          orgAvatarUrl: activeContext?.logoUrl ?? null,
          orgVerified: false,
          orgSubtitle: null,
        },
      }
      qc.setQueryData<PostCommentDto[]>(key, (old = []) =>
        draft.parentId
          ? old.map((c) => (c.id === draft.parentId ? { ...c, replies: [...(c.replies ?? []), draft] } : c))
          : [...old, draft],
      )
      const rollbackCount = patchPost(qc, scope, postId, (p) => ({ ...p, commentsCount: p.commentsCount + 1 }))
      return { previous, rollbackCount }
    },
    onError: (_error, _payload, context) => {
      if (context) {
        qc.setQueryData(key, context.previous)
        context.rollbackCount()
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['post', postId] })
    },
  })
}

export function useDeletePostComment(postId: string) {
  const qc = useQueryClient()
  const key = ['post-comments', postId]
  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/posts/${postId}/comments/${commentId}`).then((r) => r.data),
    // O comentário some na hora; volta se o servidor recusar.
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<PostCommentDto[]>(key)
      qc.setQueryData<PostCommentDto[]>(key, (old) =>
        old
          ?.filter((c) => c.id !== commentId)
          .map((c) => (c.replies ? { ...c, replies: c.replies.filter((r) => r.id !== commentId) } : c)),
      )
      return { previous }
    },
    onError: (_error, _commentId, context) => {
      qc.setQueryData(key, context?.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
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

/** Quem acompanhar na lateral do feed: políticos e entidades da região, com quem do seu círculo já segue. */
export function useWhoToFollow(enabled = true) {
  const userId = useAuthStore((s) => s.user?.id)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  return useQuery({
    queryKey: ['posts', 'who-to-follow', userId],
    queryFn: () =>
      api.get<{ profiles: FeedSuggestedProfile[] }>('/posts/who-to-follow', { params: { limit: 5 } }).then((r) => r.data.profiles),
    enabled: enabled && sessionReady,
    staleTime: 5 * 60_000,
  })
}
