import { compareProportions, type ProportionComparison } from '../ads-delivery/experiments'

/** O que o banco conta de um braço (exibições com o nome "experimento:braço"). */
export interface ArmTotals {
  impressions: number
  viewable: number
  clicks: number
  hides: number
  reports: number
  /** Gasto cobrado das exibições do braço, em milésimos de centavo (só as que de fato geraram cobrança). */
  spendMillicents: number
}

export interface ArmReport extends ArmTotals {
  /** Nome do braço (sem o nome do experimento). */
  arm: string
  /** Cliques sobre exibições vistas. */
  clickRate: number
  /** "Esconder" sobre exibições entregues. */
  hideRate: number
  /** Denúncias sobre exibições entregues. */
  reportRate: number
  /** Receita por mil exibições entregues, em reais. */
  revenuePerThousand: number
}

export interface ArmComparison {
  arm: string
  versus: string
  clickRate: ProportionComparison
  hideRate: ProportionComparison
  reportRate: ProportionComparison
  /** Diferença da receita por mil exibições (teste menos controle), em reais. Sem teste estatístico: é um valor, não uma taxa. */
  revenueDifference: number
  /** Veredito em português simples. */
  verdict: string
}

const safeDivide = (value: number, by: number) => (by > 0 ? value / by : 0)

export function buildArmReport(arm: string, totals: ArmTotals): ArmReport {
  return {
    arm,
    ...totals,
    clickRate: safeDivide(totals.clicks, totals.viewable),
    hideRate: safeDivide(totals.hides, totals.impressions),
    reportRate: safeDivide(totals.reports, totals.impressions),
    // 1.000 milésimos de centavo = 1 centavo; 100 centavos = 1 real.
    revenuePerThousand: safeDivide(totals.spendMillicents / 1000 / 100, totals.impressions) * 1000,
  }
}

/** Compara um braço de teste com o controle: cliques, "esconder", denúncia e receita. */
export function compareArms(control: ArmReport, test: ArmReport): ArmComparison {
  const clickRate = compareProportions({ success: control.clicks, total: control.viewable }, { success: test.clicks, total: test.viewable })
  const hideRate = compareProportions({ success: control.hides, total: control.impressions }, { success: test.hides, total: test.impressions })
  const reportRate = compareProportions({ success: control.reports, total: control.impressions }, { success: test.reports, total: test.impressions })
  return { arm: test.arm, versus: control.arm, clickRate, hideRate, reportRate, revenueDifference: test.revenuePerThousand - control.revenuePerThousand, verdict: verdictOf(clickRate, hideRate, reportRate) }
}

/**
 * Veredito simples. Rejeição (esconder e denúncia) pesa mais que clique: um braço que ganha cliques mas faz mais gente
 * esconder ou denunciar não é "melhor". Só diz algo quando a diferença passa do acaso nos dois braços com amostra mínima.
 */
export function verdictOf(click: ProportionComparison, hide: ProportionComparison, report: ProportionComparison): string {
  if (click.tooSmall && hide.tooSmall) return 'Amostra pequena demais para concluir. Deixe o experimento rodar mais.'
  const worse = (hide.significant && hide.difference > 0) || (report.significant && report.difference > 0)
  const better = (hide.significant && hide.difference < 0) || (report.significant && report.difference < 0)
  if (worse) return 'Pior: mais gente esconde ou denuncia. Não adote, mesmo que os cliques subam.'
  if (click.significant && click.difference > 0) return better ? 'Melhor: mais cliques e menos rejeição.' : 'Melhor em cliques, sem piorar a rejeição.'
  if (click.significant && click.difference < 0) return 'Pior em cliques, sem diferença na rejeição.'
  if (better) return 'Melhor na rejeição (menos esconder ou denúncia), sem diferença em cliques.'
  return 'Sem diferença que passe do acaso até agora.'
}

/** O que o modo sombra conta de um braço de teste. */
export interface ShadowTotals {
  total: number
  agreed: number
  /** O controle não serviu ninguém, mas o braço teria servido. */
  shadowFilledGap: number
  /** O controle serviu, mas o braço não teria servido ninguém. */
  shadowLeftEmpty: number
  /** Média do valor por mil exibições (eCPM, em centavos) do controle e do braço, nas decisões em que os dois serviram. */
  avgServedEcpmCents: number | null
  avgShadowEcpmCents: number | null
}

export interface ShadowReport extends ShadowTotals {
  arm: string
  /** Quanto o braço discorda do controle (0 a 1). */
  disagreementRate: number
  /** Diferença do valor médio por mil exibições (braço menos controle), em reais; nula se não há decisão com os dois valores. */
  ecpmDifference: number | null
}

export function buildShadowReport(arm: string, totals: ShadowTotals): ShadowReport {
  return {
    arm,
    ...totals,
    disagreementRate: safeDivide(totals.total - totals.agreed, totals.total),
    ecpmDifference: totals.avgServedEcpmCents !== null && totals.avgShadowEcpmCents !== null ? (totals.avgShadowEcpmCents - totals.avgServedEcpmCents) / 100 : null,
  }
}

const percent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`
const reais = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`

/** O relatório em texto para o terminal. */
export function formatExperimentReport(report: { key: string; days: number; arms: ArmReport[]; comparisons: ArmComparison[]; shadow: ShadowReport[] }): string {
  const lines: string[] = [`Experimento "${report.key}" (últimos ${report.days} dias)`, '']
  if (!report.arms.length) lines.push('Nenhuma exibição com este experimento ainda.')
  for (const arm of report.arms) {
    lines.push(
      `Braço ${arm.arm}: ${arm.impressions} exibições, ${arm.viewable} vistas, ${arm.clicks} cliques (${percent(arm.clickRate)} das vistas), ` +
        `${arm.hides} esconderam (${percent(arm.hideRate)}), ${arm.reports} denúncias (${percent(arm.reportRate)}), receita ${reais(arm.revenuePerThousand)} por mil exibições.`,
    )
  }
  for (const item of report.comparisons) {
    lines.push('', `${item.arm} contra ${item.versus}:`)
    lines.push(`  cliques: ${signed(item.clickRate.difference)} (z ${item.clickRate.z.toFixed(2)}${item.clickRate.significant ? ', passa do acaso' : ''})`)
    lines.push(`  esconder: ${signed(item.hideRate.difference)} (z ${item.hideRate.z.toFixed(2)}${item.hideRate.significant ? ', passa do acaso' : ''})`)
    lines.push(`  denúncia: ${signed(item.reportRate.difference)} (z ${item.reportRate.z.toFixed(2)}${item.reportRate.significant ? ', passa do acaso' : ''})`)
    lines.push(`  receita por mil: ${item.revenueDifference >= 0 ? '+' : '-'}${reais(Math.abs(item.revenueDifference))}`)
    lines.push(`  => ${item.verdict}`)
  }
  for (const item of report.shadow) {
    lines.push(
      '',
      `Sombra, braço ${item.arm}: ${item.total} decisões, discordou do controle em ${percent(item.disagreementRate, 1)}; ` +
        `teria servido onde o controle não serviu ${item.shadowFilledGap} vezes e deixado vazio onde o controle serviu ${item.shadowLeftEmpty} vezes` +
        (item.ecpmDifference === null ? '.' : `; valor médio por mil exibições ${item.ecpmDifference >= 0 ? '+' : '-'}${reais(Math.abs(item.ecpmDifference))} contra o controle.`),
    )
  }
  return lines.join('\n')
}

const signed = (value: number) => `${value >= 0 ? '+' : '-'}${percent(Math.abs(value), 3)}`
