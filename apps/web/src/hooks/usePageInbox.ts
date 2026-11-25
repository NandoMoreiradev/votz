import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { OrgType } from './useOrgMemberships'

export type PageConversationStatus = 'OPEN' | 'RESOLVED' | 'BLOCKED'

export interface PageSummary {
  orgType: OrgType
  orgId: string
  name: string
  username: string | null
  avatarUrl: string | null
}

export interface PageAttachmentView {
  id: string
  kind: 'image' | 'video' | 'audio' | 'file'
  name: string
  mimeType: string
  sizeBytes: number
  width?: number
  height?: number
  durationMs?: number
  thumbnail?: string
}

export interface PageReplyView {
  id: string
  from: 'CITIZEN' | 'STAFF'
  excerpt: string
}

export interface PageMessageView {
  id: string
  from: 'CITIZEN' | 'STAFF'
  text: string
  createdAt: string
  /** Só a equipe vê quem respondeu. */
  staffName?: string
  replyTo?: PageReplyView
  attachment?: PageAttachmentView
}

export interface CitizenSummary {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface MyPageConversationRow {
  id: string
  page: PageSummary
  status: PageConversationStatus
  unread: number
  startedBy: 'CITIZEN' | 'STAFF'
  accepted: boolean
  lastMessageAt: string
  lastText: string
  lastFrom: 'CITIZEN' | 'STAFF'
}

export interface StaffConversationRow {
  id: string
  citizen: CitizenSummary
  status: PageConversationStatus
  startedBy: 'CITIZEN' | 'STAFF'
  accepted: boolean
  unread: number
  lastMessageAt: string
  lastText: string
  lastFrom: 'CITIZEN' | 'STAFF'
}

const base = '/page-inbox'

// ── Cidadão ──────────────────────────────────────────────────────────────────

/** Conversa do cidadão com esta página (null se ainda não escreveu) e o resumo da página. */
export function usePageThread(orgType: OrgType, orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['page-inbox', 'thread', orgType, orgId],
    queryFn: () =>
      api
        .get<{ conversation: { id: string; status: PageConversationStatus } | null; page: PageSummary }>(
          `${base}/${orgType}/${orgId}/thread`,
        )
        .then((r) => r.data),
    enabled,
    retry: false,
  })
}

/** Conversas do cidadão com páginas, em páginas de 20, para a caixa unificada de /conversas. */
export function useMyPageConversationList(enabled = true) {
  return useInfiniteQuery({
    queryKey: ['page-inbox', 'mine-list'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api.get<Paged<MyPageConversationRow>>(`${base}/mine`, { signal, params: { page: pageParam } }).then((r) => r.data),
    getNextPageParam: (page) => (page.page * page.limit < page.total ? page.page + 1 : undefined),
    enabled,
    refetchInterval: 15_000,
    retry: false,
  })
}

export function useSendPageMessage(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ text, replyToId, adClickId }: { text: string; replyToId?: string; adClickId?: string }) =>
      api
        .post<{ conversationId: string; message: PageMessageView }>(`${base}/${orgType}/${orgId}/messages`, {
          text,
          ...(replyToId ? { replyToId } : {}),
          ...(adClickId ? { adClickId } : {}),
        })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-inbox'] }),
  })
}

export interface PageMediaUploadInput {
  file: Blob
  fileName: string
  caption?: string
  replyToId?: string
  /** Identificador do clique, quando a pessoa chegou aqui por um anúncio de mensagens. */
  adClickId?: string
  width?: number
  height?: number
  durationMs?: number
  thumbnail?: string
  signal?: AbortSignal
  onProgress?: (percent: number) => void
}

function buildMediaForm(input: PageMediaUploadInput): FormData {
  const form = new FormData()
  form.append('file', input.file, input.fileName)
  if (input.caption) form.append('caption', input.caption)
  if (input.replyToId) form.append('replyToId', input.replyToId)
  if (input.adClickId) form.append('adClickId', input.adClickId)
  if (input.width) form.append('width', String(input.width))
  if (input.height) form.append('height', String(input.height))
  if (input.durationMs) form.append('durationMs', String(input.durationMs))
  if (input.thumbnail) form.append('thumbnail', input.thumbnail)
  return form
}

export function useSendPageMedia(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PageMediaUploadInput) =>
      api
        .post<{ conversationId: string; message: PageMessageView }>(
          `${base}/${orgType}/${orgId}/media`,
          buildMediaForm(input),
          {
            signal: input.signal,
            onUploadProgress: (ev) => {
              if (ev.total && input.onProgress) {
                input.onProgress(Math.min(100, Math.round((ev.loaded * 100) / ev.total)))
              }
            },
          },
        )
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-inbox'] }),
  })
}

export function useMyPageConversations(enabled = true) {
  return useQuery({
    queryKey: ['page-inbox', 'mine'],
    queryFn: () => api.get<Paged<MyPageConversationRow>>(`${base}/mine`).then((r) => r.data),
    enabled,
    refetchInterval: 30_000,
    retry: false,
  })
}

export function useMyPageUnread(enabled: boolean) {
  return useQuery({
    queryKey: ['page-inbox', 'mine', 'unread'],
    queryFn: () => api.get<{ unread: number }>(`${base}/mine/unread`).then((r) => r.data.unread),
    enabled,
    refetchInterval: 30_000,
    retry: false,
  })
}

export function useMyPageConversation(id: string) {
  return useQuery({
    queryKey: ['page-inbox', 'mine', id],
    queryFn: () =>
      api
        .get<{
          id: string
          page: PageSummary | null
          status: PageConversationStatus
          startedBy: 'CITIZEN' | 'STAFF'
          accepted: boolean
          messages: PageMessageView[]
        }>(`${base}/mine/${id}`)
        .then((r) => r.data),
    enabled: !!id,
    refetchInterval: 15_000,
    retry: false,
  })
}

/** O cidadão aceita ou recusa uma conversa que a página começou. */
export function useRespondPageConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api.post(`${base}/mine/${id}/respond`, { accept }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-inbox'] }),
  })
}

export function useDeleteMyPageConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`${base}/mine/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-inbox'] }),
  })
}

// ── Equipe da página ─────────────────────────────────────────────────────────

export function useStaffUnread(orgType: OrgType, orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['page-inbox', 'staff', orgType, orgId, 'unread'],
    queryFn: () => api.get<{ unread: number }>(`${base}/${orgType}/${orgId}/unread`).then((r) => r.data.unread),
    enabled,
    refetchInterval: 30_000,
    retry: false,
  })
}

export function useStaffConversations(orgType: OrgType, orgId: string, status: PageConversationStatus | undefined) {
  return useQuery({
    queryKey: ['page-inbox', 'staff', orgType, orgId, 'list', status ?? 'ALL'],
    queryFn: () =>
      api
        .get<Paged<StaffConversationRow>>(`${base}/${orgType}/${orgId}/conversations`, { params: status ? { status } : {} })
        .then((r) => r.data),
    refetchInterval: 20_000,
    retry: false,
  })
}

export interface StaffConversationView {
  id: string
  citizen: CitizenSummary
  status: PageConversationStatus
  startedBy: 'CITIZEN' | 'STAFF'
  accepted: boolean
  messages: PageMessageView[]
  readers: { userId: string; name: string; lastReadAt: string }[]
}

export function useStaffConversation(orgType: OrgType, orgId: string, id: string | null) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['page-inbox', 'staff', orgType, orgId, 'open', id],
    queryFn: async () => {
      const data = await api.get<StaffConversationView>(`${base}/${orgType}/${orgId}/conversations/${id}`).then((r) => r.data)
      // Abrir zera as não lidas: atualiza a lista e o selo.
      qc.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId, 'list'] })
      qc.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId, 'unread'] })
      return data
    },
    enabled: !!id,
    refetchInterval: 15_000,
    retry: false,
  })
}

/** Seguidores que a página pode chamar. */
export function useStaffFollowers(orgType: OrgType, orgId: string, q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['page-inbox', 'staff', orgType, orgId, 'followers', q],
    queryFn: () =>
      api
        .get<{ items: CitizenSummary[] }>(`${base}/${orgType}/${orgId}/followers`, { params: q ? { q } : {} })
        .then((r) => r.data.items),
    enabled,
    retry: false,
  })
}

/** A página começa uma conversa com um seguidor (a pessoa precisa aceitar). */
export function useStartAsStaff(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ citizenId, text }: { citizenId: string; text: string }) =>
      api
        .post<{ conversationId: string; created: boolean }>(`${base}/${orgType}/${orgId}/conversations`, { citizenId, text })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId] }),
  })
}

export function useReplyAsStaff(orgType: OrgType, orgId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ text, replyToId }: { text: string; replyToId?: string }) =>
      api
        .post<PageMessageView>(`${base}/${orgType}/${orgId}/conversations/${id}/replies`, {
          text,
          ...(replyToId ? { replyToId } : {}),
        })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId] }),
  })
}

export function useReplyPageMedia(orgType: OrgType, orgId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PageMediaUploadInput) =>
      api
        .post<PageMessageView>(
          `${base}/${orgType}/${orgId}/conversations/${id}/media`,
          buildMediaForm(input),
          {
            signal: input.signal,
            onUploadProgress: (ev) => {
              if (ev.total && input.onProgress) {
                input.onProgress(Math.min(100, Math.round((ev.loaded * 100) / ev.total)))
              }
            },
          },
        )
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId] }),
  })
}

export async function downloadPageMediaBlob(path: string): Promise<Blob> {
  const res = await api.get<Blob>(path, { responseType: 'blob' })
  return res.data
}

export function useSetConversationStatus(orgType: OrgType, orgId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: PageConversationStatus) =>
      api.patch(`${base}/${orgType}/${orgId}/conversations/${id}`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId] }),
  })
}

// ── @usuário da página ───────────────────────────────────────────────────────

export function useSetPageHandle(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (username: string) =>
      api.patch<{ id: string; username: string }>(`/handles/${orgType}/${orgId}`, { username }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function pageErrorMessage(error: unknown): string {
  const text = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  return Array.isArray(text) ? text.join('. ') : text || 'Não foi possível concluir. Tente de novo.'
}
