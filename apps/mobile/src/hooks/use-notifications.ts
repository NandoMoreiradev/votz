import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSession } from '../lib/session'

export interface MobileNotification {
  id: string
  type: string
  read: boolean
  createdAt: string
  metadata: Record<string, unknown> | null
  report: { id: string; title: string } | null
}

interface NotificationsResponse {
  data: MobileNotification[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export function notificationSummary(n: MobileNotification): {
  label: string
  route: { pathname: string; params?: Record<string, string> } | null
} {
  const { type, report, metadata } = n
  const reportId = report?.id ?? (typeof metadata?.reportId === 'string' ? metadata.reportId : null)
  const reportTitle = report?.title
    ? `"${report.title}"`
    : typeof metadata?.reportTitle === 'string' && metadata.reportTitle.trim()
      ? `"${metadata.reportTitle.trim()}"`
      : 'um relato'
  const postId = typeof metadata?.postId === 'string' && metadata.postId.trim() ? metadata.postId.trim() : null
  const surveySlug = typeof metadata?.surveySlug === 'string' && metadata.surveySlug.trim() ? metadata.surveySlug.trim() : null

  const postRoute = postId ? { pathname: '/post/[id]', params: { id: postId } } : null
  const reportRoute = reportId ? { pathname: '/report/[id]', params: { id: reportId } } : null

  switch (type) {
    case 'POST_LIKE':
      return { label: 'Sua publicação recebeu uma curtida.', route: postRoute }
    case 'POST_COMMENT':
      return { label: 'Novo comentário na sua publicação.', route: postRoute }
    case 'POST_COMMENT_REPLY':
      return { label: 'Alguém respondeu ao seu comentário em uma publicação.', route: postRoute }
    case 'POST_REPOST':
      return { label: 'Sua publicação foi repostada.', route: postRoute }
    case 'POST_QUOTE':
      return { label: 'Sua publicação foi citada em outra publicação.', route: postRoute }
    case 'POST_MENTION':
      return { label: 'Você foi mencionado em uma publicação.', route: postRoute }
    case 'NEW_COMMENT':
      return { label: `Novo comentário em ${reportTitle}.`, route: reportRoute }
    case 'COMMENT_REPLY':
      return { label: `Alguém respondeu ao seu comentário em ${reportTitle}.`, route: reportRoute }
    case 'NEW_REPORT_RECEIVED':
      return { label: `Novo relato direcionado à sua equipe: ${reportTitle}.`, route: reportRoute }
    case 'REPORT_REASSIGNED':
      return { label: `O relato ${reportTitle} foi reatribuído à sua equipe.`, route: reportRoute }
    case 'REPORT_DISPUTED':
      return { label: `Contestaram a resolução de ${reportTitle}. Responda com provas no relato.`, route: reportRoute }
    case 'REPORT_ADVOCATED': {
      const org = typeof metadata?.orgName === 'string' && metadata.orgName.trim() ? metadata.orgName.trim() : 'Um político ou entidade'
      return { label: `${org} avocou ${reportTitle} e assumiu o compromisso de acompanhar.`, route: reportRoute }
    }
    case 'REPORT_RESOLVED':
      return metadata?.newStatus === 'ARCHIVED'
        ? { label: `${reportTitle} foi arquivado. Não concorda? Você pode contestar em até 30 dias.`, route: reportRoute }
        : { label: `${reportTitle} foi marcado como resolvido. Foi mesmo? Confirme ou conteste em até 30 dias.`, route: reportRoute }
    case 'DISPUTE_PENDING_REVIEW':
      return { label: `Nova contestação para decidir em ${reportTitle}.`, route: reportRoute }
    case 'DISPUTE_DECIDED':
      return metadata?.decision === 'REOPEN'
        ? { label: `A moderação aceitou a contestação de ${reportTitle}. O relato voltou a andar.`, route: reportRoute }
        : { label: `A moderação manteve a resolução de ${reportTitle}.`, route: reportRoute }
    case 'ADVOCACY_DEADLINE_PASSED':
      return { label: `O prazo prometido para ${reportTitle} venceu sem solução.`, route: reportRoute }
    case 'REPORT_UPDATE': {
      if (metadata?.confirmed === true) {
        return { label: `Quem fez o relato confirmou que ${reportTitle} foi resolvido.`, route: reportRoute }
      }
      const org = typeof metadata?.orgName === 'string' && metadata.orgName.trim() ? `de ${metadata.orgName.trim()} ` : ''
      return { label: `Nova atualização ${org}em ${reportTitle}.`, route: reportRoute }
    }
    case 'STATUS_CHANGED': {
      const status =
        typeof metadata?.newStatus === 'string'
          ? metadata.newStatus
          : typeof metadata?.status === 'string'
            ? metadata.status
            : ''
      const statusMap: Record<string, string> = {
        OPEN: 'Aberto',
        UNDER_REVIEW: 'Em análise',
        IN_PROGRESS: 'Em andamento',
        RESOLVED: 'Resolvido',
        DISPUTED: 'Contestado',
        ARCHIVED: 'Arquivado',
      }
      return {
        label: `Atualização em ${reportTitle}${statusMap[status] ? ` → ${statusMap[status]}` : '.'}`,
        route: reportRoute,
      }
    }
    case 'SURTO_DETECTED': {
      const city = typeof metadata?.city === 'string' && metadata.city.trim() ? ` em ${metadata.city.trim()}` : ' na sua região'
      return { label: `Foi detectado um aumento de relatos${city}.`, route: reportRoute }
    }
    case 'OFFICIAL_SURVEY_PUBLISHED': {
      const title = typeof metadata?.surveyTitle === 'string' && metadata.surveyTitle.trim() ? ` "${metadata.surveyTitle.trim()}"` : ''
      return {
        label: metadata?.invited === true
          ? `Você foi convidado para a Pesquisa Votz${title}.`
          : `Nova Pesquisa Votz disponível${title}.`,
        route: surveySlug
          ? { pathname: '/pesquisas/[slug]', params: { slug: surveySlug } }
          : { pathname: '/pesquisas' },
      }
    }
    case 'SURVEY_REVIEWED':
      return {
        label: 'Há uma atualização na revisão editorial da sua pesquisa.',
        route: surveySlug
          ? { pathname: '/pesquisas/[slug]', params: { slug: surveySlug } }
          : { pathname: '/pesquisas' },
      }
    case 'ALERT_RULE_MATCHED':
      return { label: 'Um novo relato corresponde à sua regra de alerta.', route: reportRoute }
    case 'SLA_AT_RISK':
      return { label: `O prazo de atendimento de ${reportTitle} está em risco.`, route: reportRoute }
    case 'SLA_BREACHED':
      return { label: `O prazo de atendimento de ${reportTitle} foi ultrapassado.`, route: reportRoute }
    case 'SLA_ESCALATED':
      return { label: `O atendimento de ${reportTitle} foi escalonado.`, route: reportRoute }
    case 'REPORT_ASSIGNED':
      return { label: `Um relato foi atribuído à sua equipe: ${reportTitle}.`, route: reportRoute }
    case 'PRESS_CONTACT_REQUEST':
      return { label: 'Um veículo de imprensa pediu para conversar sobre seu relato.', route: reportRoute }
    case 'PRESS_RADAR_HIT':
      return { label: 'Novos relatos correspondem ao seu Radar de Imprensa.', route: null }
    case 'CONTEXT_NOTE_SHOWN':
      return {
        label: 'Pessoas do Votz acrescentaram contexto à sua publicação ou relato.',
        route: metadata?.targetType === 'REPORT' ? reportRoute : postRoute,
      }
    default:
      return { label: 'Você recebeu uma nova notificação.', route: reportRoute ?? postRoute }
  }
}

export function useMobileNotifications(opts?: { page?: number; limit?: number; unreadOnly?: boolean }) {
  const user = useSession((s) => s.user)
  const page = opts?.page ?? 1
  const limit = opts?.limit ?? 25
  const unreadOnly = opts?.unreadOnly ?? false
  return useQuery({
    queryKey: ['notifications', { page, limit, unreadOnly }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (unreadOnly) params.set('unreadOnly', 'true')
      return api<NotificationsResponse>(`/notifications?${params.toString()}`)
    },
    enabled: !!user,
    staleTime: 15_000,
  })
}

export function useUnreadNotificationsCount() {
  const user = useSession((s) => s.user)
  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const res = await api<{ count: number }>('/notifications/unread-count')
      return res.count
    },
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 20_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}
