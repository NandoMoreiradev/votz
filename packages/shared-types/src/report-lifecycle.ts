import { ReportStatus } from './enums'

/**
 * Regras do ciclo de vida do relato, usadas pela API (que decide) e pelo site e app (que só mostram
 * as opções válidas). Mudar uma regra aqui muda as três pontas juntas.
 */

/** Status em que o relato ainda está "na mão" de quem deve resolver. */
export const ACTIVE_REPORT_STATUSES: readonly ReportStatus[] = [
  ReportStatus.OPEN,
  ReportStatus.UNDER_REVIEW,
  ReportStatus.IN_PROGRESS,
]

/** Status que o destinatário pode escolher, a partir de cada status atual. */
export const RECIPIENT_STATUS_TRANSITIONS: Readonly<Record<ReportStatus, readonly ReportStatus[]>> = {
  [ReportStatus.OPEN]: [ReportStatus.UNDER_REVIEW, ReportStatus.IN_PROGRESS, ReportStatus.RESOLVED, ReportStatus.ARCHIVED],
  [ReportStatus.UNDER_REVIEW]: [ReportStatus.IN_PROGRESS, ReportStatus.RESOLVED, ReportStatus.ARCHIVED],
  [ReportStatus.IN_PROGRESS]: [ReportStatus.RESOLVED, ReportStatus.ARCHIVED],
  // Resolvido e arquivado só mudam por contestação; contestado só muda por decisão da moderação.
  [ReportStatus.RESOLVED]: [],
  [ReportStatus.ARCHIVED]: [],
  [ReportStatus.DISPUTED]: [],
}

export function recipientStatusOptions(current: string): ReportStatus[] {
  return [...(RECIPIENT_STATUS_TRANSITIONS[current as ReportStatus] ?? [])]
}

export function canRecipientChangeStatus(from: string, to: string): boolean {
  return recipientStatusOptions(from).includes(to as ReportStatus)
}

export enum ArchiveReason {
  DUPLICATE = 'DUPLICATE',
  OUT_OF_SCOPE = 'OUT_OF_SCOPE',
  INSUFFICIENT_INFO = 'INSUFFICIENT_INFO',
  NOT_A_PUBLIC_PROBLEM = 'NOT_A_PUBLIC_PROBLEM',
}

export const ARCHIVE_REASON_LABELS: Record<ArchiveReason, string> = {
  [ArchiveReason.DUPLICATE]: 'Relato repetido (já existe outro sobre o mesmo problema)',
  [ArchiveReason.OUT_OF_SCOPE]: 'Não é com a gente (outro órgão cuida disso)',
  [ArchiveReason.INSUFFICIENT_INFO]: 'Faltam informações para atender',
  [ArchiveReason.NOT_A_PUBLIC_PROBLEM]: 'Não é um problema público',
}

export function getArchiveReasonLabel(reason: string | null | undefined): string {
  if (!reason) return ''
  return ARCHIVE_REASON_LABELS[reason as ArchiveReason] ?? reason
}

/** Limites de texto de cada ação (iguais na API, no site e no app). */
export const REPORT_LIFECYCLE_LIMITS = {
  UPDATE_MIN: 10,
  UPDATE_MAX: 500,
  /** Marcar como resolvido pede uma explicação mais completa. */
  RESOLVE_MIN: 30,
  DISPUTE_MIN: 20,
  DISPUTE_MAX: 500,
  DECISION_MIN: 20,
  WITHDRAW_MIN: 10,
  ADVOCACY_MESSAGE_MAX: 1000,
  MEDIA_MAX: 4,
  DISPUTE_EVIDENCE_MAX: 5,
} as const

/** Dias que o cidadão tem para contestar uma resolução ou um arquivamento. */
export const DISPUTE_WINDOW_DAYS = 30

/** Prazos que o político ou a entidade pode prometer ao avocar. */
export const ADVOCACY_PROMISE_DAYS: readonly number[] = [7, 15, 30, 60, 90]

export interface DisputeEligibilityInput {
  status: string
  resolvedAt?: string | Date | null
  archivedAt?: string | Date | null
  /** Datas das contestações já feitas neste relato. */
  disputeDates?: readonly (string | Date)[]
  now?: Date
}

export type DisputeIneligibleReason =
  | 'NOT_CLOSED'
  | 'WINDOW_EXPIRED'
  | 'ALREADY_DISPUTED'

/**
 * Pode contestar quem é autor (ou marcou "Eu também"), dentro de 30 dias depois da resolução ou do
 * arquivamento, uma vez por resolução: se o relato for reaberto e "resolvido" de novo, vale nova contestação.
 */
export function checkDisputeWindow(input: DisputeEligibilityInput):
  | { ok: true; closedAt: Date; deadline: Date }
  | { ok: false; reason: DisputeIneligibleReason; deadline?: Date } {
  const closedRaw =
    input.status === ReportStatus.RESOLVED
      ? input.resolvedAt
      : input.status === ReportStatus.ARCHIVED
        ? input.archivedAt
        : null
  if (!closedRaw) return { ok: false, reason: 'NOT_CLOSED' }
  const closedAt = new Date(closedRaw)
  const deadline = new Date(closedAt.getTime() + DISPUTE_WINDOW_DAYS * 86_400_000)
  const now = input.now ?? new Date()
  const alreadyDisputed = (input.disputeDates ?? []).some((d) => new Date(d).getTime() >= closedAt.getTime())
  if (alreadyDisputed) return { ok: false, reason: 'ALREADY_DISPUTED', deadline }
  if (now.getTime() > deadline.getTime()) return { ok: false, reason: 'WINDOW_EXPIRED', deadline }
  return { ok: true, closedAt, deadline }
}

/** Ações gravadas em `metadata.action` dos eventos da linha do tempo. */
export const TIMELINE_ACTIONS = {
  ADVOCATED: 'advocated',
  ADVOCACY_WITHDRAWN: 'advocacy_withdrawn',
  RESPONDED: 'responded',
  UPDATE: 'update',
  STATUS_CHANGED: 'status_changed',
  RESOLUTION_CONFIRMED: 'resolution_confirmed',
  DISPUTE_DECIDED: 'dispute_decided',
  MANDATE_ENDED: 'mandate_ended',
  MANDATE_ENDED_UNRESOLVED: 'mandate_ended_unresolved_commitment',
} as const

/** Rótulo de um evento da linha do tempo, olhando primeiro a ação e depois o tipo. */
export function timelineEventLabel(type: string, metadata?: Record<string, unknown> | null): string {
  const action = typeof metadata?.action === 'string' ? metadata.action : ''
  switch (action) {
    case TIMELINE_ACTIONS.ADVOCATED:
      return 'Avocado'
    case TIMELINE_ACTIONS.ADVOCACY_WITHDRAWN:
      return 'Desistiu da avocação'
    case TIMELINE_ACTIONS.RESOLUTION_CONFIRMED:
      return 'Resolução confirmada'
    case TIMELINE_ACTIONS.DISPUTE_DECIDED:
      return metadata?.decision === 'REOPEN' ? 'Contestação aceita' : 'Contestação negada'
    case TIMELINE_ACTIONS.MANDATE_ENDED:
    case TIMELINE_ACTIONS.MANDATE_ENDED_UNRESOLVED:
      return 'Mandato encerrado'
  }
  const byType: Record<string, string> = {
    CREATED: 'Registrado',
    RESPONDED: 'Resposta oficial',
    STATUS_CHANGED: 'Status alterado',
    UPDATE: 'Atualização',
    DISPUTED: 'Contestado',
    RESOLVED: 'Resolvido',
    ARCHIVED: 'Arquivado',
  }
  return byType[type] ?? type
}
