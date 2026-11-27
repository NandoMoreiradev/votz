/**
 * Nome de job do BullMQ para tarefas recorrentes (cron).
 *
 * O BullMQ recusa em silêncio um job novo com o mesmo `jobId` de um job que ele ainda guarda
 * (`removeOnComplete: N` mantém os últimos N concluídos). Com um nome fixo, a tarefa roda uma vez
 * e nunca mais. Com a janela de tempo no nome, cada rodada tem um nome novo, e as várias instâncias
 * que disparam o mesmo cron na mesma janela continuam gerando um job só.
 *
 * Sem ":" no resultado: o BullMQ não aceita (ver `sla.cron.ts`).
 */
export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

export function windowedJobId(prefix: string, windowMs: number, now: Date = new Date()): string {
  if (!Number.isFinite(windowMs) || windowMs < MINUTE_MS) throw new Error('windowMs deve ser de pelo menos 1 minuto')
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
  // 2026-11-27T22:00:00.000Z -> 2026-11-27T2200
  const stamp = start.toISOString().slice(0, 16).replace(':', '')
  return `${prefix}-${stamp}`
}
