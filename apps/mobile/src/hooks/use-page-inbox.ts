import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
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
export interface PageMessageView { id: string; from: 'CITIZEN' | 'STAFF'; text: string; createdAt: string }
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
    mutationFn: (text: string) =>
      api<{ conversationId: string; message: PageMessageView }>(`/page-inbox/${orgType}/${orgId}/messages`, {
        method: 'POST', body: JSON.stringify({ text }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['page-inbox'] }),
  })
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
