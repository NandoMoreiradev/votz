import type { AdClientEvent, AdEventsResult, AdSurface } from '@votz/shared-types'
import { api, json } from './api'

/**
 * Fila de eventos de anúncio (visível, clique, esconder), em lote para `POST /ads/events`. O servidor confere tudo
 * e conta uma vez só por `eventId`, então reenviar é seguro. Se a rede falhar, tenta de novo algumas vezes e depois
 * desiste (perder um evento não prejudica a pessoa).
 */
const FLUSH_DELAY_MS = 2000
const MAX_ATTEMPTS = 3
const MAX_BATCH = 50

interface QueuedEvent { event: AdClientEvent; attempts: number }
let queue: QueuedEvent[] = []
let timer: ReturnType<typeof setTimeout> | undefined

function newEventId(): string {
  // UUID v4 sem biblioteca nativa (o app não ganha dependência nova).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

export interface TrackInput {
  type: AdClientEvent['type']
  impressionId: string
  adId: string
  surface: AdSurface
  position: number
  visibleMs?: number
}

export function trackAdEvent(input: TrackInput, options: { immediate?: boolean } = {}): void {
  queue.push({ attempts: 0, event: { ...input, eventId: newEventId(), occurredAt: new Date().toISOString() } })
  if (options.immediate) { void flushAdEvents(); return }
  if (!timer) timer = setTimeout(() => { void flushAdEvents() }, FLUSH_DELAY_MS)
}

const reportedOnce = new Set<string>()
/** Como trackAdEvent, mas só a primeira vez para a mesma exibição e o mesmo tipo (a lista desenha o espaço de novo ao rolar). */
export function trackAdEventOnce(input: TrackInput): void {
  const key = `${input.impressionId}:${input.type}`
  if (reportedOnce.has(key)) return
  reportedOnce.add(key)
  trackAdEvent(input)
}

export async function flushAdEvents(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = undefined }
  while (queue.length) {
    const batch = queue.slice(0, MAX_BATCH)
    queue = queue.slice(MAX_BATCH)
    try {
      await api<AdEventsResult>('/ads/events', json({ events: batch.map((item) => item.event) }))
    } catch {
      const retry = batch.filter((item) => item.attempts + 1 < MAX_ATTEMPTS).map((item) => ({ ...item, attempts: item.attempts + 1 }))
      queue = [...retry, ...queue]
      if (retry.length && !timer) timer = setTimeout(() => { void flushAdEvents() }, FLUSH_DELAY_MS * 2)
      return
    }
  }
}
