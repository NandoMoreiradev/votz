import { ReportStatus } from './enums'

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  [ReportStatus.OPEN]: 'Aberto',
  [ReportStatus.UNDER_REVIEW]: 'Em análise',
  [ReportStatus.IN_PROGRESS]: 'Em andamento',
  [ReportStatus.RESOLVED]: 'Resolvido',
  [ReportStatus.DISPUTED]: 'Contestado',
  [ReportStatus.ARCHIVED]: 'Arquivado',
}

export function getReportStatusLabel(status: string): string {
  return REPORT_STATUS_LABELS[status as ReportStatus] ?? status
}

export const ACCOUNTABILITY_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Em processamento',
  READY: 'Pronto',
  FAILED: 'Falhou',
}

export function getAccountabilityStatusLabel(status: string): string {
  return ACCOUNTABILITY_STATUS_LABELS[status] ?? status
}

export const ALERT_RULE_TYPE_LABELS: Record<string, string> = {
  NEW_REPORT: 'Novo relato na área',
  PRESSURE_THRESHOLD: 'Pressão acima de X',
  SURTO: 'Surto detectado',
  STALLED_REPORT: 'Relato parado há N dias',
}

export function getAlertRuleTypeLabel(ruleType: string): string {
  return ALERT_RULE_TYPE_LABELS[ruleType] ?? ruleType
}

export const ALERT_FREQUENCY_LABELS: Record<string, string> = {
  IMMEDIATE: 'Imediato',
  DAILY_DIGEST: 'Digest diário',
}

export function getAlertFrequencyLabel(frequency: string): string {
  return ALERT_FREQUENCY_LABELS[frequency] ?? frequency
}

export const SHARE_CARD_FORMAT_LABELS: Record<string, string> = {
  FEED: 'Feed vertical',
  STORIES: 'Stories',
}

export function getShareCardFormatLabel(format: string): string {
  return SHARE_CARD_FORMAT_LABELS[format] ?? format
}

export const WEBHOOK_EVENT_LABELS: Record<string, string> = {
  REPORT_CREATED: 'Novo relato criado',
  REPORT_STATUS_CHANGED: 'Mudança de status do relato',
  REPORT_PRESSURE_THRESHOLD: 'Pressão acima do limite',
  OUTBREAK_DETECTED: 'Surto detectado',
  SLA_AT_RISK: 'Prazo SLA em risco',
  SLA_BREACHED: 'Prazo SLA vencido',
  REPORT_ASSIGNED: 'Relato atribuído na fila',
}

export function getWebhookEventLabel(eventType: string): string {
  return WEBHOOK_EVENT_LABELS[eventType] ?? eventType
}

export const WEBHOOK_DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  SUCCESS: 'Entregue',
  FAILED: 'Falhou',
  DEAD: 'Encerrada',
}

export function getWebhookDeliveryStatusLabel(status: string): string {
  return WEBHOOK_DELIVERY_STATUS_LABELS[status] ?? status
}
