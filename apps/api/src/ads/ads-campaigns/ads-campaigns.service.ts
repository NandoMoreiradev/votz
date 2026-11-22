import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import * as DOMPurify from 'isomorphic-dompurify'
import type { Ad, AdAccount, AdCampaign, AdCreative, AdSet } from '@prisma/client'
import type {
  AdAccountView,
  AdCampaignView,
  AdInterestId,
  AdView,
  AgeBand,
} from '@votz/shared-types'
import { AdsAiReviewService } from '../ads-ai-review/ads-ai-review.service'
import { AdsCampaignsRepository } from './ads-campaigns.repository'
import { CreateAdCampaignDto, SetAdCampaignStatusDto } from './dto/ads-campaigns.dto'

/** Quantas contas de anúncios uma empresa pode ter. */
export const MAX_AD_ACCOUNTS_PER_COMPANY = 5

type AdWithCreative = Ad & { creative: AdCreative }
type CampaignTree = AdCampaign & { adSets: (AdSet & { ads: AdWithCreative[] })[] }

const clean = (text: string) => DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\s+/g, ' ').trim()
const dayStart = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00-03:00`)

@Injectable()
export class AdsCampaignsService {
  constructor(
    private readonly repo: AdsCampaignsRepository,
    private readonly aiReview: AdsAiReviewService,
  ) {}

  // ─── Contas ──────────────────────────────────────────────────────────────

  async listAccounts(companyId: string): Promise<AdAccountView[]> {
    return (await this.repo.listAccounts(companyId)).map(toAccountView)
  }

  async createAccount(companyId: string, userId: string, name: string): Promise<AdAccountView> {
    const company = await this.repo.findCompany(companyId)
    if (!company) throw new NotFoundException('Empresa não encontrada.')
    if (!company.verified) throw new ForbiddenException('Só empresas verificadas podem anunciar no Votz.')
    if ((await this.repo.countAccounts(companyId)) >= MAX_AD_ACCOUNTS_PER_COMPANY) {
      throw new BadRequestException(`Cada empresa pode ter até ${MAX_AD_ACCOUNTS_PER_COMPANY} contas de anúncios.`)
    }
    const cleanName = clean(name)
    if (cleanName.length < 2) throw new BadRequestException('Dê um nome à conta.')
    return toAccountView(await this.repo.createAccount(companyId, cleanName, userId))
  }

  // ─── Campanhas ───────────────────────────────────────────────────────────

  async listCampaigns(companyId: string, accountId: string): Promise<AdCampaignView[]> {
    await this.ownedAccount(companyId, accountId)
    return (await this.repo.listCampaigns(accountId)).map(toCampaignView)
  }

  async createCampaign(companyId: string, accountId: string, dto: CreateAdCampaignDto): Promise<AdCampaignView> {
    await this.ownedAccount(companyId, accountId)
    const { adSet, creative } = dto

    const startAt = dayStart(adSet.startAt)
    const endAt = adSet.endAt ? dayStart(adSet.endAt) : null
    const today = dayStart(new Date(Date.now() - 3 * 3600_000).toISOString())
    if (startAt < today) throw new BadRequestException('A campanha não pode começar antes de hoje.')
    if (endAt && endAt <= startAt) throw new BadRequestException('A data de fim precisa ser depois da data de início.')

    const texts = { name: clean(dto.name), setName: clean(adSet.name), headline: clean(creative.headline), body: clean(creative.body) }
    if (Object.values(texts).some((text) => text.length < 2)) throw new BadRequestException('Preencha nome, título e texto do anúncio.')

    // Público automático: a IA escolhe; só objetivo e região contam (plano, seção 6.3).
    const automatic = adSet.automaticAudience
    const submit = !!dto.submitForReview

    const campaign = await this.repo.createCampaign({
      accountId,
      name: texts.name,
      objective: dto.objective,
      adSet: {
        name: texts.setName,
        dailyBudgetCents: adSet.dailyBudgetCents,
        bidCapCents: adSet.bidCapCents ?? null,
        startAt,
        endAt,
        states: [...new Set(adSet.states)],
        cities: [...new Set(adSet.cities.map(clean).filter(Boolean))],
        interests: automatic ? [] : [...new Set(adSet.interests)],
        ageBands: automatic ? [] : [...new Set(adSet.ageBands)],
        genders: automatic ? [] : [...new Set(adSet.genders)],
        automaticAudience: automatic,
      },
      creative: { headline: texts.headline, body: texts.body, ctaLabel: creative.ctaLabel, destinationUrl: creative.destinationUrl.trim() },
      ad: { name: texts.headline, reviewStatus: submit ? 'PENDING' : 'NOT_SUBMITTED', submittedAt: submit ? new Date() : null },
    })
    if (submit) await Promise.all(campaign.adSets.flatMap((set) => set.ads).map((ad) => this.aiReview.enqueue(ad.id)))
    return toCampaignView(campaign)
  }

  /**
   * Ligar exige anúncio aprovado e saldo na conta. Pausar e arquivar valem sempre. Campanha arquivada não volta.
   */
  async setCampaignStatus(companyId: string, campaignId: string, dto: SetAdCampaignStatusDto): Promise<AdCampaignView> {
    const campaign = await this.repo.findCampaign(campaignId)
    if (!campaign || campaign.account.companyId !== companyId) throw new NotFoundException('Campanha não encontrada.')
    if (campaign.status === 'ARCHIVED') throw new BadRequestException('Campanha arquivada não pode ser reativada. Duplique para usar de novo.')
    if (campaign.status === dto.status) return toCampaignView(campaign)

    if (dto.status === 'ACTIVE') {
      const approved = campaign.adSets.some((set) => set.ads.some((ad) => ad.reviewStatus === 'APPROVED'))
      if (!approved) throw new BadRequestException('Para ligar a campanha, pelo menos um anúncio precisa estar aprovado.')
      if (campaign.account.balanceCents <= 0) throw new BadRequestException('Para ligar a campanha, a conta precisa ter saldo. Recarregue em Faturamento.')
    }
    return toCampaignView(await this.repo.setCampaignStatus(campaignId, dto.status))
  }

  /** Manda (ou reenvia, depois de recusado) um anúncio para revisão. */
  async submitAd(companyId: string, adId: string): Promise<AdView> {
    const ad = await this.repo.findAd(adId)
    if (!ad || ad.adSet.campaign.account.companyId !== companyId) throw new NotFoundException('Anúncio não encontrado.')
    if (ad.reviewStatus === 'PENDING') throw new BadRequestException('Este anúncio já está em revisão.')
    if (ad.reviewStatus === 'APPROVED') throw new BadRequestException('Este anúncio já foi aprovado.')
    const submitted = await this.repo.submitAd(adId)
    await this.aiReview.enqueue(adId)
    return toAdView(submitted)
  }

  private async ownedAccount(companyId: string, accountId: string) {
    const account = await this.repo.findAccount(accountId)
    if (!account || account.companyId !== companyId) throw new NotFoundException('Conta de anúncios não encontrada.')
    return account
  }
}

function toAccountView(account: AdAccount): AdAccountView {
  return {
    id: account.id,
    companyId: account.companyId,
    name: account.name,
    currency: account.currency,
    timezone: account.timezone,
    balanceCents: account.balanceCents,
    createdAt: account.createdAt.toISOString(),
  }
}

function toAdView(ad: AdWithCreative): AdView {
  return {
    id: ad.id,
    name: ad.name,
    status: ad.status,
    reviewStatus: ad.reviewStatus,
    reviewNote: ad.reviewNote,
    creative: {
      id: ad.creative.id,
      headline: ad.creative.headline,
      body: ad.creative.body,
      ctaLabel: ad.creative.ctaLabel,
      destinationUrl: ad.creative.destinationUrl,
    },
  }
}

function toCampaignView(campaign: CampaignTree): AdCampaignView {
  return {
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
    adSets: campaign.adSets.map((set) => ({
      id: set.id,
      name: set.name,
      status: set.status,
      dailyBudgetCents: set.dailyBudgetCents,
      bidCapCents: set.bidCapCents,
      startAt: set.startAt.toISOString(),
      endAt: set.endAt?.toISOString() ?? null,
      states: set.states,
      cities: set.cities,
      interests: set.interests as AdInterestId[],
      ageBands: set.ageBands as AgeBand[],
      genders: set.genders,
      automaticAudience: set.automaticAudience,
      ads: set.ads.map(toAdView),
    })),
  }
}
