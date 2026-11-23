import { useMutation, useQuery } from '@tanstack/react-query'
import type { ContextNoteView } from '@votz/shared-types'
import { api, json } from '../lib/api'

export type ContextTargetType = 'POST' | 'REPORT'

type ShownMap = { enabled: boolean; POST: Record<string, ContextNoteView>; REPORT: Record<string, ContextNoteView> }

// Cada cartão do feed pede a sua nota; os pedidos feitos no mesmo instante viram uma chamada só.
const BATCH_MS = 25
const CHUNK = 50
type Waiter = { type: ContextTargetType; id: string; resolve: (note: ContextNoteView | null) => void; reject: (error: unknown) => void }
let waiters: Waiter[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

async function flush(): Promise<void> {
  const batch = waiters
  waiters = []
  timer = null
  const postIds = [...new Set(batch.filter((w) => w.type === 'POST').map((w) => w.id))]
  const reportIds = [...new Set(batch.filter((w) => w.type === 'REPORT').map((w) => w.id))]
  const merged: ShownMap = { enabled: true, POST: {}, REPORT: {} }
  try {
    const calls = [
      ...chunks(postIds).map((ids) => api<ShownMap>(`/context-notes/shown?postIds=${ids.join(',')}`)),
      ...chunks(reportIds).map((ids) => api<ShownMap>(`/context-notes/shown?reportIds=${ids.join(',')}`)),
    ]
    for (const result of await Promise.all(calls)) {
      Object.assign(merged.POST, result.POST)
      Object.assign(merged.REPORT, result.REPORT)
    }
    for (const w of batch) w.resolve(merged[w.type][w.id] ?? null)
  } catch (error) {
    for (const w of batch) w.reject(error)
  }
}

function loadShown(type: ContextTargetType, id: string): Promise<ContextNoteView | null> {
  return new Promise((resolve, reject) => {
    waiters.push({ type, id, resolve, reject })
    if (!timer) timer = setTimeout(() => void flush(), BATCH_MS)
  })
}

/** O Contexto da Comunidade está liberado? Desligado, o app não mostra nada dele. */
export function useContextNotesEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['context-notes', 'config'],
    queryFn: ({ signal }) => api<{ enabled: boolean }>('/context-notes/config', { signal }),
    staleTime: 10 * 60_000,
    retry: false,
  })
  return data?.enabled === true
}

/** A nota exibida de uma publicação ou relato (ou `null`). */
export function useShownContextNote(type: ContextTargetType, id: string) {
  const enabled = useContextNotesEnabled()
  return useQuery({
    queryKey: ['context-notes', 'shown', type, id],
    queryFn: () => loadShown(type, id),
    enabled: enabled && !!id,
    staleTime: 5 * 60_000,
  })
}

export function useRequestContext() {
  return useMutation({
    mutationFn: (body: { targetType: ContextTargetType; targetId: string }) => api('/context-notes/requests', json(body)),
  })
}
