import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { LandingFetchResult } from './landing-fetcher'

/** Só tabelas de anúncio e a equipe da empresa que anuncia. */
@Injectable()
export class AdsLandingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAdForCheck(adId: string) {
    return this.prisma.ad.findUnique({
      where: { id: adId },
      select: {
        id: true,
        status: true,
        reviewStatus: true,
        creative: { select: { destinationUrl: true, destinationKind: true } },
        adSet: { select: { campaign: { select: { id: true, name: true, status: true, account: { select: { companyId: true } } } } } },
      },
    })
  }

  /** A conferência mais recente do anúncio, antes do instante dado (para comparar com a de agora). */
  previousCheck(adId: string, before: Date) {
    return this.prisma.adLandingCheck.findFirst({ where: { adId, checkedAt: { lt: before } }, orderBy: { checkedAt: 'desc' }, select: { status: true, checkedAt: true } })
  }

  saveCheck(adId: string, trigger: 'SUBMIT' | 'WEEKLY' | 'RETRY', result: LandingFetchResult, checkedAt: Date) {
    return this.prisma.adLandingCheck.create({
      data: { adId, trigger, status: result.status, httpStatus: result.httpStatus, finalHost: result.finalHost, redirects: result.redirects, problems: result.problems, checkedAt },
    })
  }

  /** Anúncios no ar (aprovados, em campanha ligada) sem conferência nos últimos dias. */
  async dueForRecheck(since: Date, take: number): Promise<string[]> {
    const rows = await this.prisma.ad.findMany({
      where: {
        reviewStatus: 'APPROVED',
        status: { notIn: ['PAUSED', 'ARCHIVED'] },
        adSet: { status: { notIn: ['PAUSED', 'ARCHIVED'] }, campaign: { status: 'ACTIVE' } },
        // Só destino de site tem página para conferir (chat da página e WhatsApp não têm).
        creative: { destinationKind: 'URL' },
        landingChecks: { none: { checkedAt: { gte: since } } },
      },
      select: { id: true },
      take,
    })
    return rows.map((row) => row.id)
  }

  /** Pausa a campanha (o anunciante religa quando consertar o site). Devolve `false` se ela já não estava ligada. */
  async pauseCampaign(campaignId: string): Promise<boolean> {
    const paused = await this.prisma.adCampaign.updateMany({ where: { id: campaignId, status: 'ACTIVE' }, data: { status: 'PAUSED' } })
    return paused.count === 1
  }

  /** Quem da empresa gerencia anúncios (dono e papéis com a permissão). */
  async findAdvertiserUserIds(companyId: string): Promise<string[]> {
    const members = await this.prisma.orgMembership.findMany({
      where: { orgType: 'COMPANY', orgId: companyId, status: 'ACTIVE', role: { permissions: { has: 'MANAGE_ADS' } } },
      select: { userId: true },
    })
    return members.map((member) => member.userId)
  }
}
