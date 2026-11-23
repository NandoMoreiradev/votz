import type { AppNotification } from '../hooks/useNotifications'

export function notificationContent(notification: AppNotification): { label: string; href: string | null } {
  const { type, report, metadata } = notification
  const postId = typeof metadata?.postId === 'string' && metadata.postId.trim() ? metadata.postId : null
  const postLabels: Record<string, string> = {
    POST_LIKE: 'Sua publicação recebeu uma curtida.',
    POST_COMMENT: 'Novo comentário na sua publicação.',
    POST_REPOST: 'Sua publicação foi repostada.',
    POST_MENTION: 'Você foi mencionado em uma publicação.',
  }
  if (Object.prototype.hasOwnProperty.call(postLabels, type)) {
    return { label: postLabels[type], href: postId ? `/publicacoes/${encodeURIComponent(postId)}${type === 'POST_COMMENT' ? '#responder' : ''}` : null }
  }
  if (type === 'AD_APPROVED' || type === 'AD_REJECTED') {
    const name = typeof metadata?.campaignName === 'string' && metadata.campaignName.trim() ? `"${metadata.campaignName}"` : 'Seu anúncio'
    const label = type === 'AD_APPROVED'
      ? `${name} foi aprovado. Já pode ligar a campanha.`
      : `${name} foi recusado. Abra para ler o motivo e corrigir.`
    return { label, href: '/estudio/anuncios' }
  }
  if (type === 'AD_LOW_BALANCE' || type === 'AD_PAUSED_NO_BALANCE') {
    const account = typeof metadata?.accountName === 'string' && metadata.accountName.trim() ? `"${metadata.accountName}"` : 'de anúncios'
    const available = typeof metadata?.availableCents === 'number' ? ` (R$ ${(Math.max(metadata.availableCents, 0) / 100).toFixed(2).replace('.', ',')})` : ''
    const label = type === 'AD_LOW_BALANCE'
      ? `O saldo da conta ${account}${available} dura menos de um dia dos seus anúncios. Recarregue para as campanhas não pararem.`
      : `As campanhas da conta ${account} foram pausadas porque o saldo acabou. Recarregue e ligue as campanhas de novo.`
    return { label, href: '/estudio/anuncios/faturamento' }
  }
  if (type === 'AD_REFUND_PAID' || type === 'AD_REFUND_REJECTED') {
    const value = typeof metadata?.amountCents === 'number' ? `R$ ${(Math.max(metadata.amountCents, 0) / 100).toFixed(2).replace('.', ',')}` : 'o valor'
    const reason = typeof metadata?.reason === 'string' && metadata.reason.trim() ? ` Motivo: ${metadata.reason}` : ''
    const label = type === 'AD_REFUND_PAID'
      ? `A devolução de ${value} foi paga. O dinheiro já foi enviado para você.`
      : `A devolução de ${value} foi recusada e o valor voltou para o seu saldo.${reason}`
    return { label, href: '/estudio/anuncios/faturamento' }
  }
  if (type === 'AD_AUTO_TOPUP_STOPPED') {
    const reason = typeof metadata?.reason === 'string' && metadata.reason.trim() ? ` ${metadata.reason}` : ''
    return { label: `A recarga automática foi desligada.${reason} Ligue de novo em Faturamento quando quiser.`, href: '/estudio/anuncios/faturamento' }
  }
  if (type === 'AD_INVOICE_ISSUED') {
    const value = typeof metadata?.amountCents === 'number' ? ` de R$ ${(Math.max(metadata.amountCents, 0) / 100).toFixed(2).replace('.', ',')}` : ''
    return { label: `Sua nota fiscal${value} do gasto com anúncios do mês passado foi emitida. Veja em Faturamento.`, href: '/estudio/anuncios/faturamento' }
  }
  if (type === 'AD_LANDING_PAGE') {
    const name = typeof metadata?.campaignName === 'string' && metadata.campaignName.trim() ? `"${metadata.campaignName}"` : 'sua campanha'
    const host = typeof metadata?.host === 'string' && metadata.host ? ` (${metadata.host})` : ''
    const label = metadata?.status === 'BLOCKED'
      ? `Pausamos ${name}: o link do anúncio${host} leva para um endereço que não é permitido em anúncios. Troque o anúncio por um com o endereço do seu site.`
      : `Pausamos ${name}: a página do anúncio${host} não abriu nas duas últimas conferências. Quando o site voltar, ligue a campanha de novo.`
    return { label, href: '/estudio/anuncios' }
  }
  if (type === 'AD_INVALID_TRAFFIC') {
    const name = typeof metadata?.campaignName === 'string' && metadata.campaignName.trim() ? `"${metadata.campaignName}"` : 'seu anúncio'
    const credit = typeof metadata?.creditCents === 'number' && metadata.creditCents > 0 ? ` Devolvemos R$ ${(metadata.creditCents / 100).toFixed(2).replace('.', ',')} ao seu saldo.` : ''
    const label = metadata?.paused === true
      ? `Achamos cliques suspeitos em ${name} e pausamos o anúncio para você não pagar por eles.${credit} A moderação vai conferir e religar o anúncio.`
      : `Achamos cliques suspeitos em ${name}.${credit} Você não paga por cliques inválidos.`
    return { label, href: '/estudio/anuncios/relatorio' }
  }
  const href = report?.id ? `/relatos/${encodeURIComponent(report.id)}` : null
  const title = report?.title ? `"${report.title}"` : 'um relato'
  if (type === 'NEW_COMMENT') return { label: `Novo comentário em ${title}.`, href }
  if (type === 'STATUS_CHANGED') {
    const status = typeof metadata?.newStatus === 'string' ? metadata.newStatus : ''
    const labels: Record<string, string> = {
      OPEN: 'Aberto', UNDER_REVIEW: 'Em análise', IN_PROGRESS: 'Em andamento',
      RESOLVED: 'Resolvido', DISPUTED: 'Contestado', ARCHIVED: 'Arquivado',
    }
    return { label: `Atualização em ${title}${labels[status] ? ` → ${labels[status]}` : '.'}`, href }
  }
  const labels: Record<string, string> = {
    SURTO_DETECTED: 'Foi detectado um aumento de relatos na região.',
    ALERT_RULE_MATCHED: 'Um novo relato corresponde ao seu alerta.',
    WEEKLY_DIGEST: 'Seu resumo semanal está disponível.',
    SLA_AT_RISK: `O prazo de atendimento de ${title} está em risco.`,
    SLA_BREACHED: `O prazo de atendimento de ${title} foi ultrapassado.`,
    SLA_ESCALATED: `O atendimento de ${title} foi escalonado.`,
    REPORT_ASSIGNED: `Um relato foi atribuído à sua equipe: ${title}.`,
  }
  return { label: labels[type] ?? 'Você recebeu uma nova notificação.', href }
}
