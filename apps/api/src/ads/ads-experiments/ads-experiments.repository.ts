import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { ArmTotals, ShadowTotals } from './experiment-report'

/** Só tabelas de anúncio (exibições e decisões da sombra). Nada de pessoa, relato, voto ou atividade política. */
@Injectable()
export class AdsExperimentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Nomes completos dos braços ("experimento:braço") que tiveram exibição desde `since`. */
  async armLabels(key: string, since: Date): Promise<string[]> {
    const rows = await this.prisma.adImpression.groupBy({ by: ['experiment'], where: { experiment: { startsWith: `${key}:` }, servedAt: { gte: since } } })
    return rows.map((row) => row.experiment).filter((label): label is string => !!label).sort()
  }

  /** Contagem de um braço: exibições, vistas, cliques, "esconder", denúncias e o gasto cobrado. */
  async armTotals(label: string, since: Date): Promise<ArmTotals> {
    const where: Prisma.AdImpressionWhereInput = { experiment: label, servedAt: { gte: since } }
    // Dados antigos registravam o preço e a ação, sem separar o valor efetivamente faturado.
    const legacyCharged: Prisma.AdImpressionWhereInput = {
      ...where,
      billedMillicents: null,
      spendAccountId: null,
      OR: [
        { chargeOn: 'VIEWABLE_IMPRESSION', viewableAt: { not: null } },
        { chargeOn: 'CLICK', clickedAt: { not: null } },
      ],
    }
    const [impressions, viewable, clicks, hides, reports, legacySpend, spend] = await Promise.all([
      this.prisma.adImpression.count({ where }),
      this.prisma.adImpression.count({ where: { ...where, viewableAt: { not: null } } }),
      this.prisma.adImpression.count({ where: { ...where, clickedAt: { not: null } } }),
      this.prisma.adImpression.count({ where: { ...where, hiddenAt: { not: null } } }),
      this.prisma.adImpression.count({ where: { ...where, reportedAt: { not: null } } }),
      this.prisma.adImpression.aggregate({ where: legacyCharged, _sum: { chargeMillicents: true } }),
      this.prisma.adImpression.aggregate({ where, _sum: { billedMillicents: true } }),
    ])
    return { impressions, viewable, clicks, hides, reports, spendMillicents: (legacySpend._sum.chargeMillicents ?? 0) + (spend._sum.billedMillicents ?? 0) }
  }

  /** O que o modo sombra decidiu, por braço de teste. */
  async shadowTotals(key: string, since: Date): Promise<Map<string, ShadowTotals>> {
    const base: Prisma.AdShadowDecisionWhereInput = { experiment: key, createdAt: { gte: since } }
    const arms = await this.prisma.adShadowDecision.groupBy({ by: ['arm'], where: base, _count: { _all: true } })
    const out = new Map<string, ShadowTotals>()
    for (const { arm, _count } of arms) {
      const where = { ...base, arm }
      const [agreed, filled, empty, prices] = await Promise.all([
        this.prisma.adShadowDecision.count({ where: { ...where, agreed: true } }),
        this.prisma.adShadowDecision.count({ where: { ...where, servedAdId: null, shadowAdId: { not: null } } }),
        this.prisma.adShadowDecision.count({ where: { ...where, servedAdId: { not: null }, shadowAdId: null } }),
        this.prisma.adShadowDecision.aggregate({ where: { ...where, servedEcpmCents: { not: null }, shadowEcpmCents: { not: null } }, _avg: { servedEcpmCents: true, shadowEcpmCents: true } }),
      ])
      out.set(arm, {
        total: _count._all,
        agreed,
        shadowFilledGap: filled,
        shadowLeftEmpty: empty,
        avgServedEcpmCents: prices._avg.servedEcpmCents,
        avgShadowEcpmCents: prices._avg.shadowEcpmCents,
      })
    }
    return out
  }
}
