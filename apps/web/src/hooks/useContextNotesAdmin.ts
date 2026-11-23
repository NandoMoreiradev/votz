import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ContextNoteKind, ContextNoteStatus, ContextNoteTargetType } from '@votz/shared-types'
import { api } from '../lib/api'

export interface AdminContextNote {
  id: string
  kind: ContextNoteKind
  text: string
  sources: string[]
  origin: 'HUMAN' | 'AI'
  status: ContextNoteStatus
  ratingsCount: number
  helpfulShare: number | null
  shownAt: string | null
  createdAt: string
  author: { id: string; name: string } | null
  target: { type: ContextNoteTargetType; id: string; title: string; excerpt: string; link: string }
}

export interface AdminContextNotesResponse {
  data: AdminContextNote[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export function useAdminContextNotes(status: ContextNoteStatus | '', page: number) {
  return useQuery({
    queryKey: ['admin-context-notes', status, page],
    queryFn: () =>
      api
        .get<AdminContextNotesResponse>('/admin/context-notes', { params: { status: status || undefined, page, limit: 20 } })
        .then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useRemoveContextNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { id: string; reason: string }) =>
      api.post(`/admin/context-notes/${p.id}/remove`, { reason: p.reason }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-context-notes'] }),
  })
}

export function useContributorAdminAction() {
  return useMutation({
    mutationFn: (p: { userId: string; action: 'grant-write' | 'suspend' | 'restore' }) =>
      api.post(`/admin/context-notes/contributors/${p.userId}/${p.action}`).then((r) => r.data),
  })
}

/** Roda agora a conta de hora em hora (só admin). */
export function useRecalculateContextNotes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ evaluated: number; changed: number; shown: number; notShown: number }>('/admin/context-notes/recalculate').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-context-notes'] }),
  })
}
