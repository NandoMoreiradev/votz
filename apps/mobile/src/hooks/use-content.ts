import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FeedSortMode, PostCommentDto } from '@votz/shared-types'
import { api, json } from '../lib/api'
import { patchItem, prependItem, removeItem, type Rollback } from '../lib/optimistic'
import { useSession } from '../lib/session'
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
export type SearchKind = 'reports' | 'politicians' | 'entities' | 'companies' | 'users'
/** Busca da tela Explorar: relatos, políticos, entidades, empresas e pessoas (cidadãos com mínimo de 2 caracteres). */
export function useDirectory<T = PublicProfile>(kind: SearchKind, search: string) {
  const ready = kind !== 'users' || search.trim().replace(/^@+/, '').length >= 2
  return useInfiniteQuery({
    queryKey: [kind, 'directory', search], initialPageParam: 1,
    enabled: ready,
    queryFn: ({ pageParam, signal }) =>
      kind === 'users'
        ? api<Page<T>>(`/users/search?page=${pageParam}&limit=20&q=${encodeURIComponent(search)}`, { signal })
        : api<Page<T>>(`/${kind}?page=${pageParam}&limit=20&search=${encodeURIComponent(search)}`, { signal }),
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  })
}
export function useFollowing(kind: ProfileKind, id: string, enabled: boolean) {
  return useQuery({ queryKey: ['following', kind, id], queryFn: () => api<{ following: boolean }>(`/${kind}/${id}/is-following`), enabled })
}
export function useToggleFollow(kind: ProfileKind, id: string) {
  const client = useQueryClient()
  const key = ['following', kind, id]
  const bumpFollowers = (delta: number) => client.setQueryData<PublicProfile>([kind, id], (old) => old && typeof old.followersCount === 'number' ? { ...old, followersCount: Math.max(0, old.followersCount + delta) } : old)
  return useMutation({
    mutationFn: () => api<{ following: boolean }>(`/${kind}/${id}/follow`, json({})),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<{ following: boolean }>(key)
      client.setQueryData(key, { following: !previous?.following })
      bumpFollowers(previous?.following ? -1 : 1)
      return { previous }
    },
    onError: (_error, _vars, context) => {
      client.setQueryData(key, context?.previous)
      bumpFollowers(context?.previous?.following ? 1 : -1)
    },
    onSuccess: (data, _vars, context) => {
      client.setQueryData(key, data)
      if (data.following !== !context?.previous?.following) bumpFollowers(data.following ? 1 : -1)
      void client.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}

type Toggled = { rollback: Rollback }
/** Curtir: o coração e o número mudam na hora; a resposta do servidor só confirma o número final. */
export function useTogglePostLike(postId: string) {
  const client = useQueryClient()
  return useMutation<{ liked: boolean; likesCount: number }, Error, void, Toggled>({
    mutationFn: () => api(`/posts/${postId}/like`, json({})),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['posts'] })
      return { rollback: patchItem<PostDto>(client, ['posts'], postId, (post) => ({ ...post, likedByMe: !post.likedByMe, likesCount: Math.max(0, post.likesCount + (post.likedByMe ? -1 : 1)) })) }
    },
    onError: (_error, _vars, context) => context?.rollback(),
    onSuccess: (result) => { patchItem<PostDto>(client, ['posts'], postId, (post) => ({ ...post, likedByMe: result.liked, likesCount: result.likesCount })) },
  })
}
export function useTogglePostRepost(postId: string) {
  const client = useQueryClient()
  return useMutation<{ reposted: boolean; repostsCount: number }, Error, void, Toggled>({
    mutationFn: () => api(`/posts/${postId}/repost`, json({})),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['posts'] })
      return { rollback: patchItem<PostDto>(client, ['posts'], postId, (post) => ({ ...post, repostedByMe: !post.repostedByMe, repostsCount: Math.max(0, post.repostsCount + (post.repostedByMe ? -1 : 1)) })) }
    },
    onError: (_error, _vars, context) => context?.rollback(),
    onSuccess: (result) => {
      patchItem<PostDto>(client, ['posts'], postId, (post) => ({ ...post, repostedByMe: result.reposted, repostsCount: result.repostsCount }))
      void client.invalidateQueries({ queryKey: ['posts', 'profile'] })
    },
  })
}
/** Apoiar relato: o botão e o contador mudam na hora; se o servidor recusar, voltam ao que eram. */
export function useSupportReport(reportId: string, userId?: string) {
  const client = useQueryClient()
  const votesKey = ['report-votes', reportId, userId]
  type Votes = { SUPPORT: boolean; ME_TOO: boolean }
  type Counted = { id: string; _count: { votes: number; comments: number } }
  return useMutation<{ voted: boolean }, Error, void, { previous?: Votes; rollbacks: Rollback[] }>({
    mutationFn: () => api(`/reports/${reportId}/votes`, json({ type: 'SUPPORT' })),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: votesKey })
      const previous = client.getQueryData<Votes>(votesKey)
      const supported = !!previous?.SUPPORT
      client.setQueryData(votesKey, { ME_TOO: false, ...previous, SUPPORT: !supported })
      const change = (report: Counted): Counted => ({ ...report, _count: { ...report._count, votes: Math.max(0, report._count.votes + (supported ? -1 : 1)) } })
      return { previous, rollbacks: [patchItem(client, ['reports'], reportId, change), patchItem(client, ['profile-reports'], reportId, change)] }
    },
    onError: (_error, _vars, context) => {
      context?.rollbacks.forEach((rollback) => rollback())
      client.setQueryData(votesKey, context?.previous)
    },
    onSuccess: (result, _vars, context) => {
      client.setQueryData(votesKey, { ME_TOO: false, ...context?.previous, SUPPORT: result.voted })
      void client.invalidateQueries({ queryKey: ['reports'] })
      void client.invalidateQueries({ queryKey: ['profile-reports'] })
    },
  })
}
export function useComments(id: string, kind: 'posts' | 'reports' = 'posts') {
  return useQuery({ queryKey: ['comments', kind, id], queryFn: ({ signal }) => api<(PostCommentDto | ReportComment)[]>(`/${kind}/${id}/comments`, { signal }) })
}
/** Excluir publicação: some da lista na hora; volta se o servidor recusar. */
export function useDeletePost(postId: string) {
  const client = useQueryClient()
  return useMutation<unknown, Error, void, Toggled>({
    mutationFn: () => api(`/posts/${postId}`, { method: 'DELETE' }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['posts'] })
      return { rollback: removeItem(client, ['posts'], postId) }
    },
    onError: (_error, _vars, context) => context?.rollback(),
    onSettled: () => { void client.invalidateQueries({ queryKey: ['posts'] }) },
  })
}
/** Denunciar publicação ou relato para a moderação. */
export function useFlagContent() {
  return useMutation({
    mutationFn: (body: { targetType: 'POST' | 'REPORT' | 'CONTEXT_NOTE'; targetId: string; reason: string; details?: string }) => api('/moderation/flags', json(body)),
  })
}
export type CommentInput = { content: string; parentId?: string }
type CommentCache = (PostCommentDto | ReportComment)[]
type SessionUser = NonNullable<ReturnType<typeof useSession.getState>['user']>
function draftComment(kind: 'posts' | 'reports', id: string, input: CommentInput, user: SessionUser): PostCommentDto | ReportComment {
  const base = { id: `pendente-${Date.now()}`, content: input.content, parentId: input.parentId ?? null, createdAt: new Date().toISOString(), mediaUrl: null, _count: { replies: 0 } }
  if (kind === 'reports') return { ...base, mediaType: 'TEXT', author: { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null } }
  return { ...base, postId: id, mediaType: 'TEXT', mediaDuration: null, transcript: null, updatedAt: base.createdAt,
    author: { userId: user.id, name: user.name, username: user.username ?? null, avatarUrl: user.avatarUrl ?? null, verified: false, userType: user.type, orgType: null, orgId: null, orgName: null, orgAvatarUrl: null, orgVerified: false, orgSubtitle: null } } as PostCommentDto
}
/** Responder: a resposta aparece na conversa no mesmo instante; se falhar, some e o texto volta para quem escreveu. */
export function useComment(id: string, kind: 'posts' | 'reports' = 'posts') {
  const client = useQueryClient()
  const key = ['comments', kind, id]
  return useMutation<unknown, Error, CommentInput, { previous?: CommentCache; rollbacks: Rollback[] }>({
    mutationFn: (body) => api(`/${kind}/${id}/comments`, json(body)),
    onMutate: async (input) => {
      const user = useSession.getState().user
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<CommentCache>(key)
      const draft = user ? draftComment(kind, id, input, user) : null
      if (draft) client.setQueryData<CommentCache>(key, (old = []) => input.parentId
        ? old.map((comment) => comment.id === input.parentId ? { ...comment, replies: [...(comment.replies ?? []), draft] } as typeof comment : comment)
        : [...old, draft])
      const rollbacks = kind === 'posts'
        ? [patchItem<PostDto>(client, ['posts'], id, (post) => ({ ...post, commentsCount: post.commentsCount + 1 }))]
        : [patchItem<Report>(client, ['reports'], id, (report) => ({ ...report, _count: { ...report._count, comments: report._count.comments + 1 } })), patchItem<ReportSummary>(client, ['profile-reports'], id, (report) => ({ ...report, _count: { ...report._count, comments: report._count.comments + 1 } }))]
      return { previous, rollbacks }
    },
    onError: (_error, _input, context) => {
      client.setQueryData(key, context?.previous)
      context?.rollbacks.forEach((rollback) => rollback())
    },
    onSettled: () => { void client.invalidateQueries({ queryKey: key }) },
  })
}
export function useCreateContent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, body }: { kind: 'posts' | 'reports'; body: unknown }) => api<PostDto | Report>(`/${kind}`, json(body)),
    // Sem esperar a lista recarregar: o novo item entra no topo e na tela de detalhe na hora; a lista confere em segundo plano.
    onSuccess: (created, { kind }) => {
      client.setQueryData([kind, created.id], created)
      if (kind === 'posts') {
        const post = created as PostDto
        prependItem(client, ['posts'], post, (key) => key[1] === 'feed' || (key[1] === 'profile' && (key[3] === post.author.userId || key[3] === post.author.orgId)))
      } else {
        const report = created as Report
        prependItem(client, ['reports'], report, (key) => key[1] === 'feed')
        if (report.author?.id) prependItem(client, ['profile-reports'], report, (key) => key[1] === 'users' && key[2] === report.author?.id)
      }
      void client.invalidateQueries({ queryKey: [kind] })
      if (kind === 'reports') void client.invalidateQueries({ queryKey: ['profile-reports'] })
    },
  })
}

export function useProfilePosts(kind: ProfileKind, id: string) {
  return useInfiniteQuery({
    // Empresa não publica na linha do tempo: só recebe relatos.
    enabled: kind !== 'companies',
    queryKey: ['posts', 'profile', kind, id], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api<Page<PostDto>>(`/posts?${kind === 'users' ? 'profileUserId' : 'authorOrgId'}=${encodeURIComponent(id)}&sort=recent&page=${pageParam}&limit=15`, { signal }),
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
