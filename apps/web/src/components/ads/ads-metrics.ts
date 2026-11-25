import type { AdCampaignView, AdObjective, AdSetView, AdView } from '@votz/shared-types'
import type { AdStatsByAdRow } from '../../hooks/useAds'
import type { Tone } from '../studio/studio-ui'

/**
 * Contas da tela de campanhas: situação de veiculação em português simples, o "resultado" de cada objetivo
 * e a soma dos números por público e por campanha.
 */

export interface Totals {
  impressions: number
  viewableImpressions: number
  clicks: number
  hides: number
  spendCents: number
  conversions: number
  conversionValueCents: number
  messageConversations: number
}

export const EMPTY_TOTALS: Totals = { impressions: 0, viewableImpressions: 0, clicks: 0, hides: 0, spendCents: 0, conversions: 0, conversionValueCents: 0, messageConversations: 0 }

export function addTotals(a: Totals, b: Totals): Totals {
  return {
    impressions: a.impressions + b.impressions,
    viewableImpressions: a.viewableImpressions + b.viewableImpressions,
    clicks: a.clicks + b.clicks,
    hides: a.hides + b.hides,
    spendCents: a.spendCents + b.spendCents,
    conversions: a.conversions + b.conversions,
    conversionValueCents: a.conversionValueCents + b.conversionValueCents,
    messageConversations: a.messageConversations + b.messageConversations,
  }
}

export type StatsIndex = Map<string, Totals>

export function indexStats(rows: AdStatsByAdRow[] | undefined): StatsIndex {
  return new Map((rows ?? []).map((row) => [row.adId, row]))
}

export const adTotals = (ad: AdView, index: StatsIndex): Totals => index.get(ad.id) ?? EMPTY_TOTALS
export const setTotals = (set: AdSetView, index: StatsIndex): Totals => set.ads.reduce((sum, ad) => addTotals(sum, adTotals(ad, index)), EMPTY_TOTALS)
export const campaignTotals = (campaign: AdCampaignView, index: StatsIndex): Totals => campaign.adSets.reduce((sum, set) => addTotals(sum, setTotals(set, index)), EMPTY_TOTALS)

/** O que conta como "resultado" em cada objetivo, como nos gerenciadores de anúncios. */
export const RESULT_OF: Record<AdObjective, { pick: (t: Totals) => number; unit: string; costLabel: string; perThousand?: boolean }> = {
  AWARENESS: { pick: (t) => t.viewableImpressions, unit: 'exibições vistas', costLabel: 'por mil exibições', perThousand: true },
  TRAFFIC: { pick: (t) => t.clicks, unit: 'cliques', costLabel: 'por clique' },
  CONVERSIONS: { pick: (t) => t.conversions, unit: 'conversões', costLabel: 'por conversão' },
  MESSAGES: { pick: (t) => t.messageConversations, unit: 'conversas', costLabel: 'por conversa' },
}

/** Custo por resultado em centavos (nulo sem resultado). */
export function costPerResult(objective: AdObjective, totals: Totals): number | null {
  const meta = RESULT_OF[objective]
  const results = meta.pick(totals)
  if (results <= 0) return null
  return Math.round((totals.spendCents / results) * (meta.perThousand ? 1000 : 1))
}

export function ctrPercent(totals: Totals): number | null {
  return totals.viewableImpressions > 0 ? Math.round((totals.clicks / totals.viewableImpressions) * 10_000) / 100 : null
}

export interface Delivery {
  label: string
  tone: Tone
  /** Explicação curta para quem passar o mouse. */
  why?: string
}

const allAds = (campaign: AdCampaignView) => campaign.adSets.flatMap((set) => set.ads)

function scheduleOf(sets: AdSetView[], now: number): 'future' | 'ended' | 'running' {
  if (!sets.length) return 'running'
  if (sets.every((set) => set.endAt && new Date(set.endAt).getTime() < now)) return 'ended'
  if (sets.every((set) => new Date(set.startAt).getTime() > now)) return 'future'
  return 'running'
}

/** Situação de veiculação da campanha: o que de fato acontece com ela agora. */
export function campaignDelivery(campaign: AdCampaignView, balanceCents: number, now = Date.now()): Delivery {
  if (campaign.status === 'ARCHIVED') return { label: 'Arquivada', tone: 'muted' }
  const ads = allAds(campaign)
  const rejected = ads.some((ad) => ad.reviewStatus === 'REJECTED')
  const pending = ads.some((ad) => ad.reviewStatus === 'PENDING')
  const approved = ads.some((ad) => ad.reviewStatus === 'APPROVED')
  if (campaign.status === 'DRAFT') {
    if (rejected) return { label: 'Anúncio recusado', tone: 'action', why: 'Corrija o anúncio e envie de novo para revisão.' }
    if (pending) return { label: 'Em revisão', tone: 'info', why: 'A equipe do Votz está conferindo o anúncio.' }
    if (approved) return { label: 'Pronta para ligar', tone: 'info', why: 'Anúncio aprovado. Ligue a campanha para começar.' }
    return { label: 'Rascunho', tone: 'muted', why: 'Envie o anúncio para revisão.' }
  }
  if (campaign.status === 'PAUSED') return { label: 'Pausada', tone: 'muted' }
  // Ligada.
  if (!approved) {
    if (pending) return { label: 'Em revisão', tone: 'info', why: 'O anúncio mudou e volta a rodar depois de aprovado.' }
    if (rejected) return { label: 'Anúncio recusado', tone: 'action', why: 'Corrija o anúncio e envie de novo para revisão.' }
    return { label: 'Sem anúncio aprovado', tone: 'warning' }
  }
  if (balanceCents <= 0) return { label: 'Sem saldo', tone: 'warning', why: 'Recarregue o saldo para a campanha voltar a rodar.' }
  const schedule = scheduleOf(campaign.adSets, now)
  if (schedule === 'ended') return { label: 'Concluída', tone: 'muted', why: 'A data de fim já passou.' }
  if (schedule === 'future') return { label: 'Agendada', tone: 'info', why: 'Começa na data de início.' }
  return { label: 'Em veiculação', tone: 'positive' }
}

export function setDelivery(set: AdSetView, campaign: AdCampaignView, balanceCents: number, now = Date.now()): Delivery {
  const base = campaignDelivery({ ...campaign, adSets: [set] }, balanceCents, now)
  if (set.status === 'PAUSED' && campaign.status === 'ACTIVE') return { label: 'Pausado', tone: 'muted' }
  return base
}

export function adDelivery(ad: AdView, campaign: AdCampaignView, balanceCents: number): Delivery {
  if (campaign.status === 'ARCHIVED') return { label: 'Arquivado', tone: 'muted' }
  if (ad.reviewStatus === 'REJECTED') return { label: 'Recusado', tone: 'action', why: ad.reviewNote ?? undefined }
  if (ad.reviewStatus === 'PENDING') return { label: 'Em revisão', tone: 'info' }
  if (ad.reviewStatus === 'NOT_SUBMITTED') return { label: 'Não enviado', tone: 'muted', why: 'Envie para revisão para poder rodar.' }
  if (campaign.status !== 'ACTIVE') return { label: 'Aprovado', tone: 'info', why: 'Ligue a campanha para rodar.' }
  if (balanceCents <= 0) return { label: 'Sem saldo', tone: 'warning' }
  return { label: 'Em veiculação', tone: 'positive' }
}

export type DeliveryFilter = 'ALL' | 'RUNNING' | 'ATTENTION' | 'PAUSED' | 'DRAFT' | 'ARCHIVED'

export const DELIVERY_FILTERS: { value: DeliveryFilter; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'RUNNING', label: 'Em veiculação' },
  { value: 'ATTENTION', label: 'Precisam de atenção' },
  { value: 'PAUSED', label: 'Pausadas' },
  { value: 'DRAFT', label: 'Rascunhos' },
  { value: 'ARCHIVED', label: 'Arquivadas' },
]

export function matchesFilter(campaign: AdCampaignView, delivery: Delivery, filter: DeliveryFilter): boolean {
  switch (filter) {
    case 'ALL': return campaign.status !== 'ARCHIVED'
    case 'RUNNING': return delivery.tone === 'positive'
    case 'ATTENTION': return delivery.tone === 'action' || delivery.tone === 'warning'
    case 'PAUSED': return campaign.status === 'PAUSED'
    case 'DRAFT': return campaign.status === 'DRAFT'
    case 'ARCHIVED': return campaign.status === 'ARCHIVED'
  }
}
