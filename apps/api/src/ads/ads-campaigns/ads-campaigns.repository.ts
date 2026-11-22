import { Injectable } from '@nestjs/common'
import { AdObjective, AdReviewStatus, AdStatus, UserGender } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

const CAMPAIGN_TREE = {
  adSets: {
    orderBy: { createdAt: 'asc' as const },
    include: { ads: { orderBy: { createdAt: 'asc' as const }, include: { creative: true } } },
  },
}

export interface NewCampaignData {
  accountId: string
  name: string
  objective: AdObjective
  adSet: {
    name: string
    dailyBudgetCents: number
    bidCapCents: number | null
    startAt: Date
    endAt: Date | null
    states: string[]
    cities: string[]
    interests: string[]
    ageBands: string[]
    genders: UserGender[]
    automaticAudience: boolean
  }
  creative: { headline: string; body: string; ctaLabel: string; destinationUrl: string }
  ad: { name: string; reviewStatus: AdReviewStatus; submittedAt: Date | null }
}

/** Só tabelas de anúncio e o cadastro da empresa. Nada de relatos, votos ou atividade política (teste do muro). */
@Injectable()
export class AdsCampaignsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCompany(companyId: string) {
    return this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, verified: true } })
  }

  listAccounts(companyId: string) {
    return this.prisma.adAccount.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } })
  }

  countAccounts(companyId: string) {
    return this.prisma.adAccount.count({ where: { companyId } })
  }

  createAccount(companyId: string, name: string, createdById: string) {
    return this.prisma.adAccount.create({ data: { companyId, name, createdById } })
  }

  findAccount(accountId: string) {
    return this.prisma.adAccount.findUnique({ where: { id: accountId } })
  }

  listCampaigns(accountId: string) {
    return this.prisma.adCampaign.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      include: CAMPAIGN_TREE,
    })
  }

  findCampaign(campaignId: string) {
    return this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { account: { select: { id: true, companyId: true, balanceCents: true } }, ...CAMPAIGN_TREE },
    })
  }

  createCampaign(data: NewCampaignData) {
    return this.prisma.$transaction(async (tx) => {
      const creative = await tx.adCreative.create({ data: { accountId: data.accountId, ...data.creative } })
      const campaign = await tx.adCampaign.create({
        data: {
          accountId: data.accountId,
          name: data.name,
          objective: data.objective,
          adSets: {
            create: {
              ...data.adSet,
              ads: { create: { creativeId: creative.id, ...data.ad } },
            },
          },
        },
      })
      return tx.adCampaign.findUniqueOrThrow({ where: { id: campaign.id }, include: CAMPAIGN_TREE })
    })
  }

  setCampaignStatus(campaignId: string, status: AdStatus) {
    return this.prisma.adCampaign.update({ where: { id: campaignId }, data: { status }, include: CAMPAIGN_TREE })
  }

  findAd(adId: string) {
    return this.prisma.ad.findUnique({
      where: { id: adId },
      include: { adSet: { select: { campaign: { select: { account: { select: { companyId: true } } } } } } },
    })
  }

  submitAd(adId: string) {
    return this.prisma.ad.update({
      where: { id: adId },
      data: { reviewStatus: 'PENDING', submittedAt: new Date(), reviewNote: null, reviewedAt: null },
      include: { creative: true },
    })
  }
}
