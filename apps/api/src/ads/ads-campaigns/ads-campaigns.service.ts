import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as DOMPurify from 'isomorphic-dompurify'
import type { Ad, AdAccount, AdCampaign, AdCreative, AdSet, Prisma } from '@prisma/client'
import { AD_LIMITS } from '@votz/shared-types'
import type {
  AdAccountView,
  AdCampaignView,
  AdInterestId,
  AdView,
  AgeBand,
  UploadedMediaAssetDto,
} from '@votz/shared-types'
import { MediaAssetsService, type PreparedPostMedia } from '../../media/media-assets.service'
import type { MediaAssetView } from '../../media/media-items'
import { StorageService } from '../../storage/storage.service'
import { creativeMediaItem } from '../ad-creative-media'
import { AdsAiReviewService } from '../ads-ai-review/ads-ai-review.service'
import { AdsLandingService } from '../ads-landing/ads-landing.service'
import { parseBlockedDomains, staticLinkProblem } from '../ads-landing/landing-rules'
import { AdsCampaignsRepository } from './ads-campaigns.repository'
import { CreateAdCampaignDto, SetAdCampaignStatusDto, UpdateAdDto, UpdateAdSetDto } from './dto/ads-campaigns.dto'

/** Quantas contas de anúncios uma empresa pode ter. */
export const MAX_AD_ACCOUNTS_PER_COMPANY = 5

type AdWithCreative = Ad & { creative: AdCreative & { media: MediaAssetView | null } }
type CampaignTree = AdCampaign & { adSets: (AdSet & { ads: AdWithCreative[] })[] }

const clean = (text: string) => DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\s+/g, ' ').trim()
const dayStart = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00-03:00`)

@Injectable()
export class AdsCampaignsService {
  constructor(
    private readonly repo: AdsCampaignsRepository,
    private readonly aiReview: AdsAiReviewService,
    private readonly mediaAssets: MediaAssetsService,
    private readonly storage: StorageService,
    private readonly landing: AdsLandingService,
    private readonly config: ConfigService,
  ) {}

  private readonly publicUrl = (key: string) => this.storage.getPublicUrl(key)

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
    return (await this.repo.listCampaigns(accountId)).map((campaign) => toCampaignView(campaign, this.publicUrl))
  }

  // ─── Foto e vídeo do anúncio (mesmo envio das publicações, com as exigências de anúncio) ───────────

  uploadMedia(userId: string, buffer: Buffer): Promise<UploadedMediaAssetDto> {
    return this.mediaAssets.upload(userId, buffer, 'AD_CREATIVE')
  }

  presignMedia(userId: string, input: { mimeType: string; sizeBytes: number }) {
    return this.mediaAssets.presign(userId, input, 'AD_CREATIVE')
  }

  completeMedia(userId: string, id: string): Promise<UploadedMediaAssetDto> {
    return this.mediaAssets.complete(userId, id)
  }

  async createCampaign(companyId: string, accountId: string, dto: CreateAdCampaignDto, userId: string): Promise<AdCampaignView> {
    await this.ownedAccount(companyId, accountId)
    const { adSet, creative } = dto

    const startAt = dayStart(adSet.startAt)
    const endAt = adSet.endAt ? dayStart(adSet.endAt) : null
    const today = dayStart(new Date(Date.now() - 3 * 3600_000).toISOString())
    if (startAt < today) throw new BadRequestException('A campanha não pode começar antes de hoje.')
    if (endAt && endAt <= startAt) throw new BadRequestException('A data de fim precisa ser depois da data de início.')

    const texts = { name: clean(dto.name), setName: clean(adSet.name), headline: clean(creative.headline), body: clean(creative.body) }
    if (Object.values(texts).some((text) => text.length < 2)) throw new BadRequestException('Preencha nome, título e texto do anúncio.')

    // O link precisa ser de um site público, sem encurtador, rede interna nem domínio proibido (a página em si é conferida depois do envio).
    const linkProblem = this.linkProblem(creative.destinationUrl)
    if (linkProblem) throw new BadRequestException(linkProblem)

    // Público automático: a IA escolhe; só objetivo e região contam (plano, seção 6.3).
    const automatic = adSet.automaticAudience
    const submit = !!dto.submitForReview

    // Mídia por último entre as conferências: confere dono, recorte e exigências de anúncio e já gera a foto.
    // Se a campanha não for criada, os arquivos gerados são apagados e o envio fica livre de novo.
    const prepared: PreparedPostMedia | null = creative.media ? await this.mediaAssets.prepareForAdCreative(userId, creative.media) : null

    let campaign: Awaited<ReturnType<AdsCampaignsRepository['createCampaign']>>
    try {
      campaign = await this.repo.createCampaign(
        {
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
        },
        // A mídia entra na mesma transação do criativo: o anúncio nasce com a foto ou o vídeo, ou não nasce.
        prepared ? (tx, creativeId) => this.mediaAssets.attachToAdCreative(tx, creativeId, prepared) : undefined,
      )
    } catch (error) {
      if (prepared) await this.mediaAssets.releaseForPost(prepared)
      throw error
    }

    // Vídeo vai para a fila de conversão; o original da foto é apagado. Se isso falhar a campanha continua válida
    // (a tarefa horária recoloca na fila o vídeo parado).
    if (prepared) await this.mediaAssets.afterAttach(prepared)
    const ads = campaign.adSets.flatMap((set) => set.ads)
    if (submit) await Promise.all(ads.flatMap((ad) => [this.aiReview.enqueue(ad.id), this.landing.enqueue(ad.id, 'SUBMIT')]))
    // Relê a árvore para devolver a mídia já ligada (foto pronta; vídeo "preparando").
    const saved = prepared ? await this.repo.findCampaign(campaign.id) : campaign
    return toCampaignView(saved ?? campaign, this.publicUrl)
  }

  /**
   * Ligar exige anúncio aprovado e saldo na conta. Pausar e arquivar valem sempre. Campanha arquivada não volta.
   */
  async setCampaignStatus(companyId: string, campaignId: string, dto: SetAdCampaignStatusDto): Promise<AdCampaignView> {
    const campaign = await this.repo.findCampaign(campaignId)
    if (!campaign || campaign.account.companyId !== companyId) throw new NotFoundException('Campanha não encontrada.')
    if (campaign.status === 'ARCHIVED') throw new BadRequestException('Campanha arquivada não pode ser reativada. Duplique para usar de novo.')
    if (campaign.status === dto.status) return toCampaignView(campaign, this.publicUrl)

    if (dto.status === 'ACTIVE') {
      const approved = campaign.adSets.some((set) => set.ads.some((ad) => ad.reviewStatus === 'APPROVED'))
      if (!approved) throw new BadRequestException('Para ligar a campanha, pelo menos um anúncio precisa estar aprovado.')
      if (campaign.account.balanceCents <= 0) throw new BadRequestException('Para ligar a campanha, a conta precisa ter saldo. Recarregue em Faturamento.')
    }
    return toCampaignView(await this.repo.setCampaignStatus(campaignId, dto.status), this.publicUrl)
  }

  /** Manda (ou reenvia, depois de recusado) um anúncio para revisão. */
  async submitAd(companyId: string, adId: string): Promise<AdView> {
    const ad = await this.repo.findAd(adId)
    if (!ad || ad.adSet.campaign.account.companyId !== companyId) throw new NotFoundException('Anúncio não encontrado.')
    if (ad.reviewStatus === 'PENDING') throw new BadRequestException('Este anúncio já está em revisão.')
    if (ad.reviewStatus === 'APPROVED') throw new BadRequestException('Este anúncio já foi aprovado.')
    if (ad.creative.media?.status === 'FAILED') {
      throw new BadRequestException('O vídeo deste anúncio não pôde ser preparado. Crie o anúncio de novo com outro arquivo.')
    }
    // O endereço pode ter entrado na lista de bloqueio depois que o anúncio foi criado.
    const linkProblem = this.linkProblem(ad.creative.destinationUrl)
    if (linkProblem) throw new BadRequestException(`${linkProblem} Edite o anúncio antes de enviar.`)
    const submitted = await this.repo.submitAd(adId)
    await Promise.all([this.aiReview.enqueue(adId), this.landing.enqueue(adId, 'SUBMIT')])
    return toAdView(submitted, this.publicUrl)
  }

  private linkProblem(url: string): string | null {
    return staticLinkProblem(url, parseBlockedDomains(this.config.get<string>('ADS_BLOCKED_DOMAINS')))
  }

  // ─── Editar e duplicar ───────────────────────────────────────────────────

  /**
   * Edita o texto, o botão e o link do anúncio. Anúncio aprovado ou em revisão volta para a revisão (e, se estava
   * aprovado, para de rodar até ser aprovado de novo); rascunho e recusado só são editados, e o anunciante envia
   * quando quiser. Mudar nada devolve o anúncio como está.
   */
  async updateAd(companyId: string, adId: string, dto: UpdateAdDto): Promise<AdView> {
    const ad = await this.repo.findAdForEdit(adId)
    if (!ad || ad.adSet.campaign.account.companyId !== companyId) throw new NotFoundException('Anúncio não encontrado.')
    if (ad.adSet.campaign.status === 'ARCHIVED') throw new BadRequestException('Campanha arquivada não pode ser editada. Duplique para usar de novo.')

    const next = {
      headline: dto.headline !== undefined ? clean(dto.headline) : ad.creative.headline,
      body: dto.body !== undefined ? clean(dto.body) : ad.creative.body,
      ctaLabel: dto.ctaLabel ?? ad.creative.ctaLabel,
      destinationUrl: dto.destinationUrl !== undefined ? dto.destinationUrl.trim() : ad.creative.destinationUrl,
    }
    if (next.headline.length < 2 || next.body.length < 2) throw new BadRequestException('Preencha o título e o texto do anúncio.')
    const changed: Partial<typeof next> = {}
    for (const key of ['headline', 'body', 'ctaLabel', 'destinationUrl'] as const) if (next[key] !== ad.creative[key]) changed[key] = next[key]
    if (!Object.keys(changed).length) return toAdView(ad, this.publicUrl)

    if (changed.destinationUrl) {
      const problem = this.linkProblem(changed.destinationUrl)
      if (problem) throw new BadRequestException(problem)
    }

    const backToReview = ad.reviewStatus === 'APPROVED' || ad.reviewStatus === 'PENDING'
    const saved = await this.repo.updateAd(adId, {
      expectedReviewStatus: ad.reviewStatus,
      backToReview,
      name: changed.headline,
      creative: changed,
    })
    if (!saved) throw new ConflictException('O anúncio mudou agora há pouco (a moderação pode ter decidido). Atualize a tela e edite de novo.')
    // Texto novo: a leitura da IA e a conferência da página valem para o texto e o link novos.
    if (backToReview) await Promise.all([this.aiReview.enqueue(adId), this.landing.enqueue(adId, 'SUBMIT')])
    return toAdView(saved, this.publicUrl)
  }

  /** Edita público e orçamento. Não precisa de nova revisão: só vale o que a lista fechada permite. */
  async updateAdSet(companyId: string, adSetId: string, dto: UpdateAdSetDto): Promise<AdCampaignView> {
    const set = await this.repo.findAdSetForEdit(adSetId)
    if (!set || set.campaign.account.companyId !== companyId) throw new NotFoundException('Público não encontrado.')
    if (set.campaign.status === 'ARCHIVED') throw new BadRequestException('Campanha arquivada não pode ser editada. Duplique para usar de novo.')

    const data: Prisma.AdSetUpdateInput = {}
    if (dto.name !== undefined) {
      const name = clean(dto.name)
      if (name.length < 2) throw new BadRequestException('Dê um nome ao público.')
      data.name = name
    }
    if (dto.dailyBudgetCents !== undefined) data.dailyBudgetCents = dto.dailyBudgetCents
    if (dto.bidCapCents !== undefined) data.bidCapCents = dto.bidCapCents
    if (dto.endAt !== undefined) {
      const endAt = dto.endAt ? dayStart(dto.endAt) : null
      const today = dayStart(new Date(Date.now() - 3 * 3600_000).toISOString())
      if (endAt && endAt <= set.startAt) throw new BadRequestException('A data de fim precisa ser depois da data de início.')
      if (endAt && endAt < today) throw new BadRequestException('A data de fim não pode ser antes de hoje.')
      data.endAt = endAt
    }
    if (dto.states !== undefined) data.states = [...new Set(dto.states)]
    if (dto.cities !== undefined) data.cities = [...new Set(dto.cities.map(clean).filter(Boolean))]

    // Público automático: só objetivo e região contam; escolher à mão zera o automático. Idade, gênero e interesses só da lista fechada.
    const automatic = dto.automaticAudience ?? set.automaticAudience
    if (dto.automaticAudience !== undefined) data.automaticAudience = dto.automaticAudience
    if (automatic) {
      if (dto.automaticAudience === true || dto.interests !== undefined || dto.ageBands !== undefined || dto.genders !== undefined) {
        data.interests = []
        data.ageBands = []
        data.genders = []
      }
    } else {
      if (dto.interests !== undefined) data.interests = [...new Set(dto.interests)]
      if (dto.ageBands !== undefined) data.ageBands = [...new Set(dto.ageBands)]
      if (dto.genders !== undefined) data.genders = [...new Set(dto.genders)]
    }
    if (!Object.keys(data).length) throw new BadRequestException('Nada para mudar.')

    await this.repo.updateAdSet(adSetId, data)
    const campaign = await this.repo.findCampaign(set.campaign.id)
    if (!campaign) throw new NotFoundException('Campanha não encontrada.')
    return toCampaignView(campaign, this.publicUrl)
  }

  /**
   * Copia a campanha como rascunho: mesmo objetivo, públicos e textos, começando hoje. Não leva a foto nem o vídeo
   * (cada arquivo pertence a um anúncio só) e nada vai para revisão sozinho. Campanha arquivada também pode ser copiada.
   */
  async duplicateCampaign(companyId: string, campaignId: string): Promise<AdCampaignView> {
    const source = await this.repo.findCampaign(campaignId)
    if (!source || source.account.companyId !== companyId) throw new NotFoundException('Campanha não encontrada.')
    if (!source.adSets.length) throw new BadRequestException('Esta campanha não tem anúncio para copiar.')

    const startAt = dayStart(new Date(Date.now() - 3 * 3600_000).toISOString())
    const copy = await this.repo.duplicateCampaign({
      accountId: source.accountId,
      name: `Cópia de ${source.name}`.slice(0, AD_LIMITS.NAME_MAX),
      objective: source.objective,
      adSets: source.adSets.map((set) => ({
        set: {
          name: set.name,
          dailyBudgetCents: set.dailyBudgetCents,
          bidCapCents: set.bidCapCents,
          startAt,
          // Mantém o fim só se ainda é no futuro; senão, sem data para acabar.
          endAt: set.endAt && set.endAt > startAt ? set.endAt : null,
          states: set.states,
          cities: set.cities,
          interests: set.interests,
          ageBands: set.ageBands,
          genders: set.genders,
          automaticAudience: set.automaticAudience,
        },
        ads: set.ads.map((ad) => ({
          name: ad.name,
          creative: { headline: ad.creative.headline, body: ad.creative.body, ctaLabel: ad.creative.ctaLabel, destinationUrl: ad.creative.destinationUrl },
        })),
      })),
    })
    return toCampaignView(copy, this.publicUrl)
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

function toAdView(ad: AdWithCreative, publicUrl: (key: string) => string): AdView {
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
      media: creativeMediaItem(ad.creative.media, publicUrl),
    },
  }
}

function toCampaignView(campaign: CampaignTree, publicUrl: (key: string) => string): AdCampaignView {
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
      ads: set.ads.map((ad) => toAdView(ad, publicUrl)),
    })),
  }
}
