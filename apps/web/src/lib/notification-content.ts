import type { AppNotification } from '../hooks/useNotifications'

export function notificationContent(notification: AppNotification): { label: string; href: string | null } {
  const { type, report, metadata } = notification
  const postId = typeof metadata?.postId === 'string' && metadata.postId.trim() ? metadata.postId : null
  const postLabels: Record<string, string> = {
    POST_LIKE: 'Sua publicação recebeu uma curtida.',
    POST_COMMENT: 'Novo comentário na sua publicação.',
    POST_COMMENT_REPLY: 'Alguém respondeu ao seu comentário em uma publicação.',
    POST_REPOST: 'Sua publicação foi repostada.',
    POST_QUOTE: 'Sua publicação foi citada em outra publicação.',
    POST_MENTION: 'Você foi mencionado em uma publicação.',
  }
  if (Object.prototype.hasOwnProperty.call(postLabels, type)) {
    const hash = type === 'POST_COMMENT' || type === 'POST_COMMENT_REPLY' ? '#responder' : ''
    return { label: postLabels[type], href: postId ? `/publicacoes/${encodeURIComponent(postId)}${hash}` : null }
  }
  if (type === 'OFFICIAL_SURVEY_PUBLISHED') {
    const surveyTitle = typeof metadata?.surveyTitle === 'string' && metadata.surveyTitle.trim() ? ` "${metadata.surveyTitle.trim()}"` : ''
    const slug = typeof metadata?.surveySlug === 'string' && metadata.surveySlug.trim() ? metadata.surveySlug.trim() : null
    const invited = metadata?.invited === true
    return {
      label: invited
        ? `Você foi convidado para a Pesquisa Votz${surveyTitle}.`
        : `Nova Pesquisa Votz disponível${surveyTitle}.`,
      href: slug ? `/pesquisas/${encodeURIComponent(slug)}` : '/pesquisas',
    }
  }
  if (type === 'SURVEY_REVIEWED') {
    const surveyTitle = typeof metadata?.surveyTitle === 'string' && metadata.surveyTitle.trim() ? `"${metadata.surveyTitle.trim()}"` : 'Sua pesquisa'
    const slug = typeof metadata?.surveySlug === 'string' && metadata.surveySlug.trim() ? metadata.surveySlug.trim() : null
    const status = metadata?.reviewStatus
    const note = typeof metadata?.reviewNote === 'string' && metadata.reviewNote.trim() ? ` Motivo: ${metadata.reviewNote.trim()}` : ''
    const label = status === 'APPROVED'
      ? `${surveyTitle} foi aprovada na revisão editorial.`
      : status === 'REJECTED'
        ? `${surveyTitle} não foi aprovada na revisão editorial.${note}`
        : `Atualização na revisão de ${surveyTitle}.${note}`
    return { label, href: slug ? `/pesquisas/${encodeURIComponent(slug)}` : '/pesquisas' }
  }
  if (type === 'CONTEXT_NOTE_SHOWN') {
    const targetId = typeof metadata?.targetId === 'string' && metadata.targetId.trim() ? metadata.targetId : null
    const isReport = metadata?.targetType === 'REPORT'
    const base = isReport ? '/relatos/' : '/publicacoes/'
    return {
      label: `Pessoas do Votz acrescentaram contexto ${isReport ? 'ao seu relato' : 'à sua publicação'}. Se discordar, dá para denunciar a nota.`,
      href: targetId ? `${base}${encodeURIComponent(targetId)}` : null,
    }
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
  if (type === 'PRESS_CONTACT_REQUEST') {
    const outlet = typeof metadata?.outletName === 'string' && metadata.outletName.trim() ? `"${metadata.outletName}"` : 'Um veículo de imprensa'
    const title = typeof metadata?.reportTitle === 'string' && metadata.reportTitle.trim() ? ` sobre o seu relato "${metadata.reportTitle}"` : ''
    return { label: `${outlet} quer falar com você${title}. Você decide se aceita; seu telefone e e-mail não foram passados.`, href: '/pedidos-da-imprensa' }
  }
  if (type === 'PRESS_CONTACT_ACCEPTED' || type === 'PRESS_CONTACT_DECLINED') {
    const title = typeof metadata?.reportTitle === 'string' && metadata.reportTitle.trim() ? ` sobre "${metadata.reportTitle}"` : ''
    const label = type === 'PRESS_CONTACT_ACCEPTED'
      ? `O autor aceitou o seu pedido de contato${title}. Veja a resposta na página de imprensa.`
      : `O seu pedido de contato${title} ficou sem disponibilidade.`
    return { label, href: '/imprensa' }
  }
  if (type === 'PRESS_RADAR_HIT') {
    const rule = typeof metadata?.ruleName === 'string' && metadata.ruleName.trim() ? ' "' + metadata.ruleName + '"' : ''
    const count = typeof metadata?.count === 'number' ? metadata.count : 1
    return { label: 'Radar' + rule + ': ' + count + (count === 1 ? ' novidade' : ' novidades') + ' para a sua cobertura. Veja no e-mail ou na página de imprensa.', href: '/imprensa' }
  }
  if (type === 'PRESS_CREDENTIAL_APPROVED' || type === 'PRESS_CREDENTIAL_REJECTED' || type === 'PRESS_CREDENTIAL_REVOKED') {
    const outlet = typeof metadata?.outletName === 'string' && metadata.outletName.trim() ? ` de "${metadata.outletName}"` : ''
    const reason = typeof metadata?.reviewNote === 'string' && metadata.reviewNote.trim() ? ` Motivo: ${metadata.reviewNote}` : ''
    const label = type === 'PRESS_CREDENTIAL_APPROVED'
      ? `A credencial de imprensa${outlet} foi aprovada. Recarregue a página de imprensa para usar o painel.${reason}`
      : type === 'PRESS_CREDENTIAL_REJECTED'
        ? `O pedido de credencial de imprensa${outlet} não foi aprovado.${reason}`
        : `A credencial de imprensa${outlet} foi cancelada.${reason}`
    return { label, href: '/imprensa' }
  }
  const href = report?.id ? `/relatos/${encodeURIComponent(report.id)}` : null
  const title = report?.title
    ? `"${report.title}"`
    : typeof metadata?.reportTitle === 'string' && metadata.reportTitle.trim()
      ? `"${metadata.reportTitle.trim()}"`
      : 'um relato'
  if (type === 'NEW_COMMENT') return { label: `Novo comentário em ${title}.`, href }
  if (type === 'COMMENT_REPLY') return { label: `Alguém respondeu ao seu comentário em ${title}.`, href }
  if (type === 'NEW_REPORT_RECEIVED') return { label: `Novo relato direcionado à sua equipe: ${title}.`, href }
  if (type === 'REPORT_REASSIGNED') return { label: `O relato ${title} foi reatribuído à sua equipe.`, href }
  const org = typeof metadata?.orgName === 'string' && metadata.orgName.trim() ? metadata.orgName.trim() : null
  if (type === 'REPORT_DISPUTED') return { label: `Contestaram a resolução de ${title}. Responda com provas no relato.`, href }
  if (type === 'REPORT_ADVOCATED') return { label: `${org ?? 'Um político ou entidade'} avocou ${title} e assumiu o compromisso de acompanhar.`, href }
  if (type === 'REPORT_RESOLVED') {
    return metadata?.newStatus === 'ARCHIVED'
      ? { label: `${title} foi arquivado. Não concorda? Você pode contestar em até 30 dias.`, href }
      : { label: `${title} foi marcado como resolvido. Foi mesmo? Confirme ou conteste em até 30 dias.`, href }
  }
  if (type === 'DISPUTE_PENDING_REVIEW') return { label: `Nova contestação para decidir em ${title}.`, href: '/admin' }
  if (type === 'DISPUTE_DECIDED') {
    return metadata?.decision === 'REOPEN'
      ? { label: `A moderação aceitou a contestação de ${title}. O relato voltou a andar.`, href }
      : { label: `A moderação manteve a resolução de ${title}.`, href }
  }
  if (type === 'ADVOCACY_DEADLINE_PASSED') return { label: `O prazo prometido para ${title} venceu sem solução.`, href }
  if (type === 'REPORT_UPDATE') {
    if (metadata?.confirmed === true) return { label: `Quem fez o relato confirmou que ${title} foi resolvido.`, href }
    return { label: `Nova atualização ${org ? `de ${org} ` : ''}em ${title}.`, href }
  }
  if (type === 'STATUS_CHANGED') {
    const status =
      typeof metadata?.newStatus === 'string'
        ? metadata.newStatus
        : typeof metadata?.status === 'string'
          ? metadata.status
          : ''
    const labels: Record<string, string> = {
      OPEN: 'Aberto', UNDER_REVIEW: 'Em análise', IN_PROGRESS: 'Em andamento',
      RESOLVED: 'Resolvido', DISPUTED: 'Contestado', ARCHIVED: 'Arquivado',
    }
    return { label: `Atualização em ${title}${labels[status] ? ` → ${labels[status]}` : '.'}`, href }
  }
  if (type === 'SURTO_DETECTED') {
    const surtoId = typeof metadata?.surtoId === 'string' && metadata.surtoId.trim() ? metadata.surtoId.trim() : null
    const city = typeof metadata?.city === 'string' && metadata.city.trim() ? ` em ${metadata.city.trim()}` : ' na região'
    return {
      label: `Foi detectado um aumento de relatos${city}.`,
      href: surtoId ? `/surtos/${encodeURIComponent(surtoId)}` : href,
    }
  }
  const labels: Record<string, string> = {
    ALERT_RULE_MATCHED: 'Um novo relato corresponde ao seu alerta.',
    WEEKLY_DIGEST: 'Seu resumo semanal está disponível.',
    SLA_AT_RISK: `O prazo de atendimento de ${title} está em risco.`,
    SLA_BREACHED: `O prazo de atendimento de ${title} foi ultrapassado.`,
    SLA_ESCALATED: `O atendimento de ${title} foi escalonado.`,
    REPORT_ASSIGNED: `Um relato foi atribuído à sua equipe: ${title}.`,
  }
  return { label: labels[type] ?? 'Você recebeu uma nova notificação.', href }
}
