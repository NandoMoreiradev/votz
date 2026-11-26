import { NotificationType } from '@prisma/client'

export interface NotificationPreferenceFlags {
  inAppEnabled: boolean
  emailEnabled: boolean
  pushEnabled: boolean
  reportUpdates: boolean
  reportComments: boolean
  officialResponses: boolean
  localSurges: boolean
  officialSurveys: boolean
  mentions: boolean
  weeklyDigest: boolean
  quietHoursStart: number | null
  quietHoursEnd: number | null
}

type EventPreferenceKey =
  | 'reportUpdates'
  | 'reportComments'
  | 'officialResponses'
  | 'localSurges'
  | 'officialSurveys'
  | 'mentions'
  | 'weeklyDigest'

const EVENT_PREF_MAP: Partial<Record<NotificationType, EventPreferenceKey>> = {
  STATUS_CHANGED: 'reportUpdates',
  REPORT_UPDATE: 'officialResponses',
  NEW_COMMENT: 'reportComments',
  COMMENT_REPLY: 'reportComments',
  SURTO_DETECTED: 'localSurges',
  OFFICIAL_SURVEY_PUBLISHED: 'officialSurveys',
  POST_MENTION: 'mentions',
  WEEKLY_DIGEST: 'weeklyDigest',
}

/**
 * Retorna a hora atual (0..23) no fuso de Brasília (America/Sao_Paulo),
 * alinhada com a convenção de `UserNotificationPreference.quietHoursStart/End`.
 */
export function getSaoPauloHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const raw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  return Number.isFinite(raw) ? raw % 24 : 0
}

export function isWithinQuietHours(
  start: number | null | undefined,
  end: number | null | undefined,
  now = new Date(),
): boolean {
  if (start === null || start === undefined || end === null || end === undefined) return false
  if (start === end) return false
  const hour = getSaoPauloHour(now)
  if (start < end) {
    return hour >= start && hour < end
  }
  // Janela que cruza a meia-noite (ex.: 22h -> 7h)
  return hour >= start || hour < end
}

export function isEventEnabledForUser(
  type: NotificationType,
  pref?: Partial<NotificationPreferenceFlags> | null,
): boolean {
  if (!pref) return true
  const key = EVENT_PREF_MAP[type]
  if (!key) return true
  return pref[key] !== false
}

export function shouldDeliverInApp(
  type: NotificationType,
  pref?: Partial<NotificationPreferenceFlags> | null,
): boolean {
  if (!pref) return true
  if (pref.inAppEnabled === false) return false
  return isEventEnabledForUser(type, pref)
}

export function shouldDeliverPush(
  type: NotificationType,
  pref?: Partial<NotificationPreferenceFlags> | null,
  now = new Date(),
): boolean {
  if (!pref) return true
  if (pref.pushEnabled === false) return false
  if (!isEventEnabledForUser(type, pref)) return false
  if (isWithinQuietHours(pref.quietHoursStart, pref.quietHoursEnd, now)) return false
  return true
}

export function buildPushPayload(
  type: NotificationType,
  reportId?: string | null,
  metadata?: Record<string, unknown>,
): { title: string; body: string; data: Record<string, string> } {
  const data: Record<string, string> = { type }
  if (reportId) data.reportId = reportId
  if (typeof metadata?.postId === 'string') data.postId = metadata.postId
  if (typeof metadata?.surtoId === 'string') data.surtoId = metadata.surtoId
  if (typeof metadata?.surveySlug === 'string') data.surveySlug = metadata.surveySlug

  const reportTitle =
    typeof metadata?.reportTitle === 'string' && metadata.reportTitle.trim()
      ? `"${metadata.reportTitle.trim()}"`
      : 'um relato'

  switch (type) {
    case NotificationType.NEW_REPORT_RECEIVED:
      return { title: 'Novo relato recebido', body: `Você recebeu um novo relato: ${reportTitle}.`, data }
    case NotificationType.REPORT_REASSIGNED:
      return { title: 'Relato atribuído', body: `O relato ${reportTitle} foi direcionado para sua equipe.`, data }
    case NotificationType.REPORT_DISPUTED:
      return { title: 'Relato contestado', body: `O autor contestou a resolução de ${reportTitle}.`, data }
    case NotificationType.REPORT_UPDATE:
      return { title: 'Nova atualização oficial', body: `Há uma nova atualização em ${reportTitle}.`, data }
    case NotificationType.STATUS_CHANGED:
      return { title: 'Status atualizado', body: `O status de ${reportTitle} foi atualizado.`, data }
    case NotificationType.NEW_COMMENT:
      return { title: 'Novo comentário', body: `Novo comentário em ${reportTitle}.`, data }
    case NotificationType.COMMENT_REPLY:
      return { title: 'Nova resposta', body: `Alguém respondeu ao seu comentário em ${reportTitle}.`, data }
    case NotificationType.SURTO_DETECTED:
      return { title: 'Surto detectado', body: 'Foi detectado um aumento de relatos na sua região.', data }
    case NotificationType.ALERT_RULE_MATCHED:
      return { title: 'Alerta do Votz', body: 'Um novo relato corresponde à sua regra de alerta.', data }
    case NotificationType.SLA_AT_RISK:
      return { title: 'Prazo de SLA em risco', body: `O prazo de atendimento de ${reportTitle} está próximo do limite.`, data }
    case NotificationType.SLA_BREACHED:
      return { title: 'Prazo de SLA ultrapassado', body: `O prazo de atendimento de ${reportTitle} foi ultrapassado.`, data }
    case NotificationType.SLA_ESCALATED:
      return { title: 'Atendimento escalonado', body: `O atendimento de ${reportTitle} foi escalonado.`, data }
    case NotificationType.REPORT_ASSIGNED:
      return { title: 'Relato atribuído a você', body: `O relato ${reportTitle} foi atribuído na fila.`, data }
    case NotificationType.POST_LIKE:
      return { title: 'Nova curtida', body: 'Sua publicação recebeu uma curtida.', data }
    case NotificationType.POST_COMMENT:
      return { title: 'Novo comentário', body: 'Sua publicação recebeu um novo comentário.', data }
    case NotificationType.POST_COMMENT_REPLY:
      return { title: 'Nova resposta', body: 'Alguém respondeu ao seu comentário em uma publicação.', data }
    case NotificationType.POST_REPOST:
      return { title: 'Publicação repostada', body: 'Sua publicação foi repostada.', data }
    case NotificationType.POST_QUOTE:
      return { title: 'Publicação citada', body: 'Alguém citou sua publicação.', data }
    case NotificationType.POST_MENTION:
      return { title: 'Você foi mencionado', body: 'Alguém mencionou você em uma publicação.', data }
    case NotificationType.OFFICIAL_SURVEY_PUBLISHED:
      return { title: 'Nova Pesquisa Votz', body: 'Uma nova pesquisa oficial da sua região está aberta.', data }
    case NotificationType.SURVEY_REVIEWED:
      return { title: 'Pesquisa revisada', body: 'Há uma atualização sobre a revisão da sua pesquisa.', data }
    case NotificationType.PRESS_CONTACT_REQUEST:
      return { title: 'Pedido de contato da imprensa', body: 'Um veículo verificado pediu para falar sobre seu relato.', data }
    case NotificationType.PRESS_RADAR_HIT:
      return { title: 'Radar de Imprensa', body: 'Novos relatos correspondem ao seu radar de cobertura.', data }
    default:
      return { title: 'Votz', body: 'Você recebeu uma nova notificação.', data }
  }
}
