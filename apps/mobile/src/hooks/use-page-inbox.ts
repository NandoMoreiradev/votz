import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as FileSystem from 'expo-file-system/legacy'
import { API_URL, api, conversationSocketToken, uploadFile } from '../lib/api'
import { useSession } from '../lib/session'
import type { ProfileKind } from '../lib/types'

/** Tipo de página como a API usa; cidadão não recebe mensagem de página. */
export type OrgType = 'ENTITY' | 'POLITICIAN' | 'COMPANY'
export const ORG_BY_KIND: Partial<Record<ProfileKind, OrgType>> = {
  entities: 'ENTITY',
  politicians: 'POLITICIAN',
  companies: 'COMPANY',
}
export const KIND_BY_ORG: Record<OrgType, ProfileKind> = {
  ENTITY: 'entities',
  POLITICIAN: 'politicians',
  COMPANY: 'companies',
}

export type PageStatus = 'OPEN' | 'RESOLVED' | 'BLOCKED'
export interface PageSummary { orgType: OrgType; orgId: string; name: string; username: string | null; avatarUrl: string | null }
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
export interface PageReplyView { id: string; from: 'CITIZEN' | 'STAFF'; excerpt: string }
export interface PageMessageView {
  id: string
  from: 'CITIZEN' | 'STAFF'
  text: string
  createdAt: string
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
export interface StaffConversationRow {
  id: string
  citizen: CitizenSummary
  status: PageStatus
  startedBy: 'CITIZEN' | 'STAFF'
  accepted: boolean
  unread: number
  lastMessageAt: string
  lastText: string
  lastFrom: 'CITIZEN' | 'STAFF'
}
export interface StaffConversationView {
  id: string
  citizen: CitizenSummary
  status: PageStatus
  startedBy: 'CITIZEN' | 'STAFF'
  accepted: boolean
  messages: PageMessageView[]
  readers: { userId: string; name: string; lastReadAt: string }[]
}
export interface MyPageConversationRow {
  id: string; page: PageSummary; status: PageStatus; unread: number
  startedBy: 'CITIZEN' | 'STAFF'; accepted: boolean
  lastMessageAt: string; lastText: string; lastFrom: 'CITIZEN' | 'STAFF'
}

export const NOTICE_TEXT = 'Esta conversa é com a equipe da página. Várias pessoas da equipe podem ler e responder.'

export function usePageThread(orgType: OrgType | undefined, orgId: string) {
  const user = useSession((s) => s.user)
  return useQuery({
    queryKey: ['page-inbox', 'thread', orgType, orgId],
    queryFn: () =>
      api<{ conversation: { id: string; status: PageStatus } | null; page: PageSummary }>(`/page-inbox/${orgType}/${orgId}/thread`),
    enabled: !!user && !!orgType,
    retry: false,
  })
}

export function useMyPageConversationList(enabled = true) {
  const user = useSession((s) => s.user)
  return useInfiniteQuery({
    queryKey: ['page-inbox', 'mine-list'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api<{ items: MyPageConversationRow[]; total: number; page: number; limit: number }>(`/page-inbox/mine?page=${pageParam}`),
    getNextPageParam: (page) => (page.page * page.limit < page.total ? page.page + 1 : undefined),
    enabled: !!user && enabled,
    refetchInterval: 15_000,
    retry: false,
  })
}

export function useSendPageMessage(orgType: OrgType | undefined, orgId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ text, replyToId, adClickId }: { text: string; replyToId?: string; adClickId?: string }) =>
      api<{ conversationId: string; message: PageMessageView }>(`/page-inbox/${orgType}/${orgId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text, ...(replyToId ? { replyToId } : {}), ...(adClickId ? { adClickId } : {}) }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['page-inbox'] }),
  })
}

export interface MobilePageMediaInput {
  uri: string
  mimeType: string
  caption?: string
  replyToId?: string
  /** Identificador do clique, quando a pessoa chegou aqui por um anúncio de mensagens. */
  adClickId?: string
  width?: number
  height?: number
  durationMs?: number
  thumbnail?: string
  signal?: AbortSignal
}

export function useSendPageMedia(orgType: OrgType | undefined, orgId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: MobilePageMediaInput) =>
      uploadFile<{ conversationId: string; message: PageMessageView }>(
        `/page-inbox/${orgType}/${orgId}/media`,
        { uri: input.uri, mimeType: input.mimeType },
        {
          timeoutMs: 5 * 60_000,
          signal: input.signal,
          parameters: {
            ...(input.caption ? { caption: input.caption } : {}),
            ...(input.replyToId ? { replyToId: input.replyToId } : {}),
            ...(input.adClickId ? { adClickId: input.adClickId } : {}),
            ...(input.width ? { width: String(input.width) } : {}),
            ...(input.height ? { height: String(input.height) } : {}),
            ...(input.durationMs ? { durationMs: String(input.durationMs) } : {}),
            ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
          },
        },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['page-inbox'] }),
  })
}

export async function downloadPageMediaFile(conversationId: string, attachmentId: string): Promise<string> {
  const token = await conversationSocketToken()
  const dest = `${FileSystem.cacheDirectory}page-media-${attachmentId}`
  const res = await FileSystem.downloadAsync(
    `${API_URL}/page-inbox/mine/${conversationId}/media/${attachmentId}`,
    dest,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (res.status < 200 || res.status >= 300) throw new Error('Não foi possível baixar o arquivo.')
  return res.uri
}

export function useMyPageConversations() {
  const user = useSession((s) => s.user)
  return useQuery({
    queryKey: ['page-inbox', 'mine'],
    queryFn: () => api<{ items: MyPageConversationRow[]; total: number }>('/page-inbox/mine'),
    enabled: !!user, refetchInterval: 30_000, retry: false,
  })
}

export function useMyPageConversation(id: string) {
  return useQuery({
    queryKey: ['page-inbox', 'mine', id],
    queryFn: () => api<{ id: string; page: PageSummary | null; status: PageStatus; startedBy: 'CITIZEN' | 'STAFF'; accepted: boolean; messages: PageMessageView[] }>(`/page-inbox/mine/${id}`),
    enabled: !!id, refetchInterval: 15_000, retry: false,
  })
}

/** Aceitar ou recusar uma conversa que a página começou. */
export function useRespondPageConversation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api<{ id: string; accepted: boolean }>(`/page-inbox/mine/${id}/respond`, { method: 'POST', body: JSON.stringify({ accept }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['page-inbox'] }),
  })
}

export function useDeleteMyPageConversation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ deleted: boolean }>(`/page-inbox/mine/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['page-inbox'] }),
  })
}

// ── Equipe da página (Político, Entidade, Empresa) ───────────────────────────

export function useStaffConversations(orgType: OrgType | undefined, orgId: string | undefined, status?: PageStatus) {
  return useQuery({
    queryKey: ['page-inbox', 'staff', orgType, orgId, 'list', status ?? 'ALL'],
    queryFn: ({ signal }) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : ''
      return api<{ items: StaffConversationRow[]; total: number; page: number; limit: number }>(
        `/page-inbox/${orgType}/${orgId}/conversations${qs}`,
        { signal },
      )
    },
    enabled: !!orgType && !!orgId,
    refetchInterval: 20_000,
    retry: false,
  })
}

export function useStaffConversation(orgType: OrgType | undefined, orgId: string | undefined, id: string | undefined) {
  const client = useQueryClient()
  return useQuery({
    queryKey: ['page-inbox', 'staff', orgType, orgId, 'open', id],
    queryFn: async ({ signal }) => {
      const data = await api<StaffConversationView>(`/page-inbox/${orgType}/${orgId}/conversations/${id}`, { signal })
      void client.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId, 'list'] })
      return data
    },
    enabled: !!orgType && !!orgId && !!id,
    refetchInterval: 15_000,
    retry: false,
  })
}

export function useReplyAsStaff(orgType: OrgType | undefined, orgId: string | undefined, id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ text, replyToId }: { text: string; replyToId?: string }) =>
      api<PageMessageView>(`/page-inbox/${orgType}/${orgId}/conversations/${id}/replies`, {
        method: 'POST',
        body: JSON.stringify({ text, ...(replyToId ? { replyToId } : {}) }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId] }),
  })
}

export function useReplyPageMedia(orgType: OrgType | undefined, orgId: string | undefined, id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: MobilePageMediaInput) =>
      uploadFile<PageMessageView>(
        `/page-inbox/${orgType}/${orgId}/conversations/${id}/media`,
        { uri: input.uri, mimeType: input.mimeType },
        {
          timeoutMs: 5 * 60_000,
          signal: input.signal,
          parameters: {
            ...(input.caption ? { caption: input.caption } : {}),
            ...(input.replyToId ? { replyToId: input.replyToId } : {}),
            ...(input.width ? { width: String(input.width) } : {}),
            ...(input.height ? { height: String(input.height) } : {}),
            ...(input.durationMs ? { durationMs: String(input.durationMs) } : {}),
            ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
          },
        },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId] }),
  })
}

export function useSetStaffConversationStatus(orgType: OrgType | undefined, orgId: string | undefined, id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (status: PageStatus) =>
      api(`/page-inbox/${orgType}/${orgId}/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId] }),
  })
}

export async function downloadStaffPageMediaFile(
  orgType: OrgType,
  orgId: string,
  conversationId: string,
  attachmentId: string,
): Promise<string> {
  const token = await conversationSocketToken()
  const dest = `${FileSystem.cacheDirectory}staff-page-media-${attachmentId}`
  const res = await FileSystem.downloadAsync(
    `${API_URL}/page-inbox/${orgType}/${orgId}/conversations/${conversationId}/media/${attachmentId}`,
    dest,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (res.status < 200 || res.status >= 300) throw new Error('Não foi possível baixar o arquivo.')
  return res.uri
}
