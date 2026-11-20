import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export interface PageMessageView {
  id: string
  from: 'CITIZEN' | 'STAFF'
  text: string
  createdAt: string
  /** Só a equipe vê quem respondeu. */
  staffName?: string
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
  lastMessageAt: string
  lastText: string
  lastFrom: 'CITIZEN' | 'STAFF'
}

export interface StaffConversationRow {
  id: string
  citizen: CitizenSummary
  status: PageConversationStatus
  unread: number
  lastMessageAt: string
  lastText: string
  lastFrom: 'CITIZEN' | 'STAFF'
}

const base = '/page-inbox'

// ── Cidadão ──────────────────────────────────────────────────────────────────

export function usePageThread(orgType: OrgType, orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['page-inbox', 'thread', orgType, orgId],
    queryFn: () =>
      api
        .get<{ conversation: { id: string; status: PageConversationStatus } | null }>(`${base}/${orgType}/${orgId}/thread`)
        .then((r) => r.data.conversation),
    enabled,
    retry: false,
  })
}

export function useSendPageMessage(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) =>
      api
        .post<{ conversationId: string; message: PageMessageView }>(`${base}/${orgType}/${orgId}/messages`, { text })
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

export function useMyPageConversation(id: string) {
  return useQuery({
    queryKey: ['page-inbox', 'mine', id],
    queryFn: () =>
      api
        .get<{ id: string; page: PageSummary | null; status: PageConversationStatus; messages: PageMessageView[] }>(`${base}/mine/${id}`)
        .then((r) => r.data),
    enabled: !!id,
    refetchInterval: 15_000,
    retry: false,
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

export function useReplyAsStaff(orgType: OrgType, orgId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) =>
      api.post<PageMessageView>(`${base}/${orgType}/${orgId}/conversations/${id}/replies`, { text }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-inbox', 'staff', orgType, orgId] }),
  })
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
