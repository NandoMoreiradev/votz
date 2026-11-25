import { Injectable } from '@nestjs/common'
import { AdDestinationKind, AdObjective, AdReviewStatus, AdStatus, Prisma, UserGender } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CREATIVE_WITH_MEDIA } from '../ad-creative-media'

const CAMPAIGN_TREE = {
  adSets: {
    orderBy: { createdAt: 'asc' as const },
    include: { ads: { orderBy: { createdAt: 'asc' as const }, include: { creative: CREATIVE_WITH_MEDIA } } },
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
  creative: { headline: string; body: string; ctaLabel: string; destinationUrl: string; destinationKind: AdDestinationKind; whatsappPhone?: string | null; whatsappText?: string | null }
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

  /**
   * Quantas pessoas da equipe da empresa podem responder mensagens da página (permissão REPLY_MESSAGES). Anúncio que leva
   * ao chat da página só liga com pelo menos uma.
   */
  countStaffWhoCanReply(companyId: string) {
    return this.prisma.orgMembership.count({
      where: { orgType: 'COMPANY', orgId: companyId, status: 'ACTIVE', role: { permissions: { has: 'REPLY_MESSAGES' } } },
    })
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

  /** `attachMedia` roda na mesma transação: a foto ou o vídeo entra junto com o criativo, ou nada é criado. */
  createCampaign(data: NewCampaignData, attachMedia?: (tx: Prisma.TransactionClient, creativeId: string) => Promise<void>) {
    return this.prisma.$transaction(async (tx) => {
      const creative = await tx.adCreative.create({ data: { accountId: data.accountId, ...data.creative } })
      if (attachMedia) await attachMedia(tx, creative.id)
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
      include: {
        creative: CREATIVE_WITH_MEDIA,
        adSet: { select: { campaign: { select: { account: { select: { companyId: true } } } } } },
      },
    })
  }

  /** Anúncio com o que a edição precisa: criativo, mídia e a campanha (situação e empresa). */
  findAdForEdit(adId: string) {
    return this.prisma.ad.findUnique({
      where: { id: adId },
      include: {
        creative: CREATIVE_WITH_MEDIA,
        adSet: { select: { campaign: { select: { id: true, status: true, objective: true, account: { select: { companyId: true } } } } } },
      },
    })
  }

  /**
   * Edita o texto, o botão e o link do criativo. A troca só vale se o anúncio ainda está na situação de revisão lida
   * (`expectedReviewStatus`): se a moderação decidiu no meio, devolve `null` e nada muda. `backToReview` renova o envio
   * (`submittedAt`), que é o que impede a moderação de aprovar o texto antigo.
   */
  updateAd(
    adId: string,
    params: {
      expectedReviewStatus: AdReviewStatus
      backToReview: boolean
      name?: string
      creative: { headline?: string; body?: string; ctaLabel?: string; destinationUrl?: string; whatsappPhone?: string | null; whatsappText?: string | null }
      /** Roda na mesma transação, depois de a situação de revisão ser conferida (usado para trocar a foto ou o vídeo). */
      inTransaction?: (tx: Prisma.TransactionClient, creativeId: string) => Promise<void>
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.ad.updateMany({
        where: { id: adId, reviewStatus: params.expectedReviewStatus },
        data: {
          // Sempre toca algum campo: `updateMany` sem nada para gravar não conta a linha e a edição viraria conflito.
          updatedAt: new Date(),
          ...(params.name ? { name: params.name } : {}),
          ...(params.backToReview ? { reviewStatus: 'PENDING', submittedAt: new Date(), reviewNote: null, reviewedAt: null } : {}),
        },
      })
      if (claimed.count === 0) return null
      const ad = await tx.ad.findUniqueOrThrow({ where: { id: adId }, select: { creativeId: true } })
      if (Object.keys(params.creative).length) await tx.adCreative.update({ where: { id: ad.creativeId }, data: params.creative })
      if (params.inTransaction) await params.inTransaction(tx, ad.creativeId)
      return tx.ad.findUniqueOrThrow({ where: { id: adId }, include: { creative: CREATIVE_WITH_MEDIA } })
    })
  }

  findAdSetForEdit(adSetId: string) {
    return this.prisma.adSet.findUnique({
      where: { id: adSetId },
      include: { campaign: { select: { id: true, status: true, account: { select: { companyId: true } } } } },
    })
  }

  updateAdSet(adSetId: string, data: Prisma.AdSetUpdateInput) {
    return this.prisma.adSet.update({ where: { id: adSetId }, data })
  }

  /** Copia a campanha como rascunho: cada conjunto e cada anúncio com criativo novo (sem foto ou vídeo), tudo sem revisão. */
  duplicateCampaign(data: {
    accountId: string
    name: string
    objective: AdObjective
    adSets: { set: Omit<NewCampaignData['adSet'], never>; ads: { name: string; creative: NewCampaignData['creative'] }[] }[]
  }) {
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.adCampaign.create({ data: { accountId: data.accountId, name: data.name, objective: data.objective } })
      for (const { set, ads } of data.adSets) {
        const adSet = await tx.adSet.create({ data: { ...set, campaignId: campaign.id } })
        for (const ad of ads) {
          const creative = await tx.adCreative.create({ data: { accountId: data.accountId, ...ad.creative } })
          await tx.ad.create({ data: { adSetId: adSet.id, creativeId: creative.id, name: ad.name } })
        }
      }
      return tx.adCampaign.findUniqueOrThrow({ where: { id: campaign.id }, include: CAMPAIGN_TREE })
    })
  }

  submitAd(adId: string) {
    return this.prisma.ad.update({
      where: { id: adId },
      data: { reviewStatus: 'PENDING', submittedAt: new Date(), reviewNote: null, reviewedAt: null },
      include: { creative: CREATIVE_WITH_MEDIA },
    })
  }
}
