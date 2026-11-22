/**
 * Regras de tráfego inválido (plano de anúncios, seção 7). Só contagem por anúncio e dia: nada de pessoa.
 * Tudo aqui é puro (sem banco) para testar com exatidão.
 *
 * Política decidida pelo dono em 22/11/2026:
 * - tráfego inválido não é cobrado e, se já foi, volta como crédito (só em anúncio cobrado por clique);
 * - o caso vai para a fila da moderação, que confirma ou descarta;
 * - o anúncio só é pausado sozinho no caso extremo, para ninguém derrubar o anúncio de outro clicando de propósito.
 */
export const IVT = {
  /** Abaixo disso não há amostra para julgar. */
  MIN_VIEWABLE: 200,
  MIN_CLICKS: 20,
  /** Taxa de cliques que já merece revisão (o normal fica em 1% a 5%). */
  REVIEW_CTR: 0.2,
  /** Taxa de cliques que o Votz considera possível: o que passa disso é tratado como inválido. */
  PLAUSIBLE_CTR: 0.1,
  /** Caso extremo: taxa de cliques e amostra bem maiores. */
  EXTREME_CTR: 0.4,
  EXTREME_MIN_VIEWABLE: 500,
  EXTREME_MIN_CLICKS: 50,
  /** Parte dos cliques sem exibição vista antes que merece revisão, e que é extrema. */
  NO_VIEW_SHARE: 0.5,
  EXTREME_NO_VIEW_SHARE: 0.8,
} as const

export type IvtSignal = 'CTR_ABNORMAL' | 'CLICKS_WITHOUT_VIEW'
export type IvtLevel = 'REVIEW' | 'EXTREME'

export interface IvtFacts {
  viewable: number
  clicks: number
  /** Cliques de exibições que nunca chegaram a ser vistas. */
  clicksWithoutView: number
}

export interface IvtVerdict {
  level: IvtLevel
  signals: IvtSignal[]
  /** Quantos dos cliques contam como inválidos. */
  invalidClicks: number
}

const safe = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)

/** Julga um anúncio num dia. `null` = tráfego normal ou amostra pequena demais. */
export function judgeTraffic(facts: IvtFacts): IvtVerdict | null {
  const viewable = safe(facts.viewable)
  const clicks = safe(facts.clicks)
  const withoutView = Math.min(safe(facts.clicksWithoutView), clicks)
  if (clicks < IVT.MIN_CLICKS) return null

  const signals: IvtSignal[] = []
  let invalid = 0
  let extreme = false

  const ctr = viewable > 0 ? clicks / viewable : Number.POSITIVE_INFINITY
  if (viewable >= IVT.MIN_VIEWABLE && ctr > IVT.REVIEW_CTR) {
    signals.push('CTR_ABNORMAL')
    invalid = Math.max(invalid, clicks - Math.floor(IVT.PLAUSIBLE_CTR * viewable))
    if (ctr > IVT.EXTREME_CTR && viewable >= IVT.EXTREME_MIN_VIEWABLE && clicks >= IVT.EXTREME_MIN_CLICKS) extreme = true
  }

  const share = withoutView / clicks
  if (share > IVT.NO_VIEW_SHARE) {
    signals.push('CLICKS_WITHOUT_VIEW')
    invalid = Math.max(invalid, withoutView)
    if (share > IVT.EXTREME_NO_VIEW_SHARE && clicks >= IVT.EXTREME_MIN_CLICKS) extreme = true
  }

  if (!signals.length) return null
  return { level: extreme ? 'EXTREME' : 'REVIEW', signals, invalidClicks: Math.min(invalid, clicks) }
}

/**
 * Quanto devolver (milésimos de centavo) pelos cliques inválidos. `grossSpendMillicents` é o gasto do dia antes de
 * qualquer crédito. Só anúncio cobrado por clique devolve: nos outros o clique não gera cobrança.
 */
export function creditMillicents(input: { chargeOn: 'CLICK' | 'VIEWABLE_IMPRESSION'; grossSpendMillicents: number; clicks: number; invalidClicks: number }): number {
  if (input.chargeOn !== 'CLICK') return 0
  const clicks = safe(input.clicks)
  if (clicks === 0) return 0
  const invalid = Math.min(safe(input.invalidClicks), clicks)
  return Math.round((safe(input.grossSpendMillicents) * invalid) / clicks)
}

/**
 * Aplica um crédito ao gasto ainda não lançado da conta. Primeiro abate do gasto pendente (que nunca chegou ao
 * livro-caixa); o que sobrar vira devolução em centavos inteiros, arredondada para cima (a favor do anunciante).
 */
export function applyCreditToPending(pendingMillicents: number, creditMillicentsValue: number): { newPendingMillicents: number; refundCents: number } {
  const pending = safe(pendingMillicents)
  const credit = safe(creditMillicentsValue)
  if (credit <= pending) return { newPendingMillicents: pending - credit, refundCents: 0 }
  const need = credit - pending
  const refundCents = Math.ceil(need / 1000)
  return { newPendingMillicents: refundCents * 1000 - need, refundCents }
}
