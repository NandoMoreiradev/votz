import type { AdClientEvent, AdEventsResult, AdSurface } from '@votz/shared-types'
import { api } from './api'

/**
 * Fila de eventos de anúncio (visível, clique, esconder). Junta e manda em lote para `POST /ads/events`. O servidor
 * confere tudo (a exibição precisa ser desta pessoa) e conta uma vez só por `eventId`, então repetir o envio é seguro.
 * Se o envio falhar por rede, tenta de novo algumas vezes; depois desiste (perder um evento não prejudica a pessoa).
 */
const FLUSH_DELAY_MS = 2000
const MAX_ATTEMPTS = 3
const MAX_BATCH = 50

interface QueuedEvent {
  event: AdClientEvent
  attempts: number
}

let queue: QueuedEvent[] = []
let timer: ReturnType<typeof setTimeout> | undefined

function newEventId(): string {
  return crypto.randomUUID()
}

export interface TrackInput {
  type: AdClientEvent['type']
  impressionId: string
  adId: string
  surface: AdSurface
  position: number
  visibleMs?: number
}

/** `now` é a hora do evento no aparelho (o servidor também guarda a hora em que recebeu). */
export function trackAdEvent(input: TrackInput, options: { immediate?: boolean } = {}): void {
  queue.push({
    attempts: 0,
    event: { ...input, eventId: newEventId(), occurredAt: new Date().toISOString() },
  })
  if (options.immediate) {
    void flushAdEvents()
    return
  }
  if (!timer) timer = setTimeout(() => void flushAdEvents(), FLUSH_DELAY_MS)
}

const reportedOnce = new Set<string>()
/** Como trackAdEvent, mas só a primeira vez para a mesma exibição e o mesmo tipo (o React pode rodar o efeito duas vezes). */
export function trackAdEventOnce(input: TrackInput): void {
  const key = `${input.impressionId}:${input.type}`
  if (reportedOnce.has(key)) return
  reportedOnce.add(key)
  trackAdEvent(input)
}

export async function flushAdEvents(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  while (queue.length) {
    const batch = queue.slice(0, MAX_BATCH)
    queue = queue.slice(MAX_BATCH)
    try {
      await api.post<AdEventsResult>('/ads/events', { events: batch.map((item) => item.event) })
    } catch {
      const retry = batch.filter((item) => item.attempts + 1 < MAX_ATTEMPTS).map((item) => ({ ...item, attempts: item.attempts + 1 }))
      queue = [...retry, ...queue]
      if (retry.length && !timer) timer = setTimeout(() => void flushAdEvents(), FLUSH_DELAY_MS * 2)
      return
    }
  }
}

if (typeof document !== 'undefined') {
  // Ao sair da aba, manda o que sobrou (o que não der tempo se perde, sem prejuízo).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAdEvents()
  })
}
