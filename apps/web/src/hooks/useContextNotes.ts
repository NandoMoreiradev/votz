import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ContextNoteKind,
  ContextNoteRatingValue,
  ContextNoteTargetType,
  type ContextNoteView,
} from '@votz/shared-types'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

type ShownMap = {
  enabled: boolean
  POST: Record<string, ContextNoteView>
  REPORT: Record<string, ContextNoteView>
}

// ── Leitura em lote ──────────────────────────────────────────────────────────────
// Cada cartão do feed pede a sua nota; juntamos os pedidos feitos no mesmo instante numa chamada só.
const BATCH_MS = 25
const CHUNK = 50
type Waiter = { type: ContextNoteTargetType; id: string; resolve: (note: ContextNoteView | null) => void; reject: (e: unknown) => void }
let waiters: Waiter[] = []
let timer: ReturnType<typeof setTimeout> | null = null

const chunks = <T,>(list: T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

async function flush(): Promise<void> {
  const batch = waiters
  waiters = []
  timer = null
  const postIds = [...new Set(batch.filter((w) => w.type === ContextNoteTargetType.POST).map((w) => w.id))]
  const reportIds = [...new Set(batch.filter((w) => w.type === ContextNoteTargetType.REPORT).map((w) => w.id))]
  const merged: ShownMap = { enabled: true, POST: {}, REPORT: {} }
  try {
    const calls = [
      ...chunks(postIds).map((ids) => api.get<ShownMap>('/context-notes/shown', { params: { postIds: ids.join(',') } })),
      ...chunks(reportIds).map((ids) => api.get<ShownMap>('/context-notes/shown', { params: { reportIds: ids.join(',') } })),
    ]
    for (const res of await Promise.all(calls)) {
      Object.assign(merged.POST, res.data.POST)
      Object.assign(merged.REPORT, res.data.REPORT)
    }
    for (const w of batch) w.resolve((w.type === ContextNoteTargetType.POST ? merged.POST : merged.REPORT)[w.id] ?? null)
  } catch (err) {
    for (const w of batch) w.reject(err)
  }
}

function loadShown(type: ContextNoteTargetType, id: string): Promise<ContextNoteView | null> {
  return new Promise((resolve, reject) => {
    waiters.push({ type, id, resolve, reject })
    if (!timer) timer = setTimeout(() => void flush(), BATCH_MS)
  })
}

export function errorText(err: unknown, fallback = 'Não foi possível concluir. Tente de novo.'): string {
  const e = err as { response?: { data?: { message?: string | string[] } } }
  const msg = e?.response?.data?.message
  return Array.isArray(msg) ? msg[0] : msg || fallback
}

// ── Liberação do recurso ─────────────────────────────────────────────────────────
export function useContextNotesEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['context-notes', 'config'],
    queryFn: () => api.get<{ enabled: boolean }>('/context-notes/config').then((r) => r.data),
    staleTime: 10 * 60_000,
    retry: false,
  })
  return data?.enabled === true
}

/** A nota exibida para uma publicação ou relato (ou `null`). Só consulta se o recurso estiver liberado. */
export function useShownContextNote(type: ContextNoteTargetType, id: string | undefined) {
  const enabled = useContextNotesEnabled()
  return useQuery({
    queryKey: ['context-notes', 'shown', type, id],
    queryFn: () => loadShown(type, id as string),
    enabled: enabled && !!id,
    staleTime: 5 * 60_000,
  })
}

// ── Colaborador ──────────────────────────────────────────────────────────────────
export interface ContributorStatus {
  enabled: boolean
  termsVersion: string
  joined: boolean
  suspended: boolean
  blockedReason: string | null
  canRate: boolean
  canWrite: boolean
  progress: { ratingsGiven: number; ratingsNeededToWrite: number }
}

export function useContributorStatus() {
  const enabled = useContextNotesEnabled()
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['context-notes', 'me', user?.id],
    queryFn: () => api.get<ContributorStatus>('/context-notes/contributor/me').then((r) => r.data),
    enabled: enabled && !!user,
    staleTime: 60_000,
  })
}

export function useJoinContributor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (termsVersion: string) =>
      api.post<ContributorStatus>('/context-notes/contributor', { acceptTerms: true, termsVersion }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['context-notes'] }),
  })
}

// ── Fila ─────────────────────────────────────────────────────────────────────────
export interface QueueTarget {
  type: ContextNoteTargetType
  id: string
  title: string
  excerpt: string
  link: string
}
export interface QueueNote {
  note: { id: string; kind: ContextNoteKind; text: string; sources: string[]; origin: 'HUMAN' | 'AI'; createdAt: string }
  target: QueueTarget
}
export interface ContextQueue {
  canWrite: boolean
  toRate: QueueNote[]
  requested: Array<{ count: number; target: QueueTarget }>
}

export function useContextQueue(enabled: boolean) {
  return useQuery({
    queryKey: ['context-notes', 'queue'],
    queryFn: () => api.get<ContextQueue>('/context-notes/queue').then((r) => r.data),
    enabled,
    staleTime: 30_000,
  })
}

// ── Ações ────────────────────────────────────────────────────────────────────────
export function useRequestContext() {
  return useMutation({
    mutationFn: (p: { targetType: ContextNoteTargetType; targetId: string }) =>
      api.post('/context-notes/requests', p).then((r) => r.data),
  })
}

export interface CreateContextNotePayload {
  targetType: ContextNoteTargetType
  targetId: string
  kind: ContextNoteKind
  text: string
  sources: string[]
}

export function useCreateContextNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: CreateContextNotePayload) => api.post('/context-notes', p).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['context-notes', 'queue'] }),
  })
}

export function useRateContextNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { noteId: string; value: ContextNoteRatingValue; reasons: string[] }) =>
      api.put(`/context-notes/${p.noteId}/rating`, { value: p.value, reasons: p.reasons }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['context-notes', 'queue'] })
      void qc.invalidateQueries({ queryKey: ['context-notes', 'me'] })
    },
  })
}
