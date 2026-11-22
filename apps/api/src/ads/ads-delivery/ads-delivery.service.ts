import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import {
  AD_DELIVERY,
  AD_DELIVERY_LIMITS,
  ageBandOf,
  ageOn,
  adChargeMillicents,
  adChargeUnit,
  adFloorCents,
  type AdDailyStatView,
  type AdEventsResult,
  type SponsoredAdView,
} from '@votz/shared-types'
import { ContentAdjacencyService } from '../../content-adjacency/content-adjacency.service'
import { StorageService } from '../../storage/storage.service'
import { creativeMediaItem, creativeMediaReady } from '../ad-creative-media'
import { AdsClickLinkService } from '../ads-conversions/ads-click-link.service'
import { newClickToken } from '../ads-conversions/conversion-rules'
import { AdsDeliveryRepository, type AdCandidateRecord } from './ads-delivery.repository'
import { AdEventsBatchDto, NextAdQueryDto } from './dto/ads-delivery.dto'
import {
  CTR_MODEL,
  qualityFactor,
  PRIOR_CTR,
  auctionClickRate,
  clickRatePosterior,
  dayAsDate,
  dayElapsedFraction,
  isHoldout,
  matchesTargeting,
  pacingChance,
  runAuction,
  saoPauloDay,
  validateEvent,
  type AuctionCandidate,
  type Viewer,
} from './delivery-rules'

const CANDIDATE_POOL = 200
const HOUR_MS = 3600_000
const PLATFORM_PRIOR_TTL_MS = 10 * 60_000

/**
 * Entrega de anúncios e contagem dos eventos (Etapa 2 do plano). A seleção é por contexto e regras, sem IA: o servidor
 * de anúncios com modelos chega na Etapa 3. As regras de privacidade já valem: sem aceite, só cidade e estado da
 * tela; faixa de idade, gênero e interesses só com aceite e para maiores de 18 anos.
 */
@Injectable()
export class AdsDeliveryService {
  private readonly logger = new Logger(AdsDeliveryService.name)
  /** Chance de clique de partida da plataforma (média dos últimos dias). Muda devagar: guardada por 10 minutos. */
  private platformPrior: { value: number; at: number } | null = null

  constructor(
    private readonly repo: AdsDeliveryRepository,
    private readonly storage: StorageService,
    private readonly clickLinks: AdsClickLinkService,
    private readonly adjacency: ContentAdjacencyService,
  ) {}

  /** Escolhe o anúncio da vez para esta pessoa (ou nenhum) e registra a entrega. */
  async next(userId: string, query: NextAdQueryDto, now = new Date(), random: () => number = Math.random): Promise<SponsoredAdView | null> {
    if (isHoldout(userId, AD_DELIVERY_LIMITS.HOLDOUT_SHARE)) return null

    const facts = await this.repo.findViewerFacts(userId)
    if (!facts) return null
    const viewer = buildViewer(facts, query)

    const since = new Date(now.getTime() - 24 * HOUR_MS)
    const [hiddenCompanies, excludedAds] = await Promise.all([
      this.repo.hiddenCompanyIds(userId),
      this.repo.excludedAdIds(userId, since, AD_DELIVERY.MAX_IMPRESSIONS_PER_USER_AD_DAY),
    ])
    // Nenhum anúncio perto de relato contra o próprio anunciante. Se não deu para conferir a vizinhança, não mostra:
    // errar para o lado de não exibir custa uma exibição; errar para o outro lado, a confiança no Votz.
    const nearCompanies = await this.companiesNextToSlot(query)
    if (!nearCompanies) return null
    const pool = await this.repo.findCandidates(now, [...new Set([...hiddenCompanies, ...nearCompanies])], excludedAds, CANDIDATE_POOL)
    if (!pool.length) return null

    const day = saoPauloDay(now)
    const spent = await this.repo.spentTodayByAdSet([...new Set(pool.map((ad) => ad.adSetId))], day)

    const eligible = pool.filter((ad) => {
      const { objective } = ad.adSet.campaign
      const account = ad.adSet.campaign.account
      // A consulta já filtra, mas conferimos de novo: nunca vai para o feed vídeo que ainda está sendo preparado.
      if (!creativeMediaReady(ad.creative.media)) return false
      // Saldo disponível: o que a conta tem menos o gasto que ainda não foi lançado.
      if (account.balanceCents * 1000 - account.pendingSpendMillicents <= 0) return false
      if (!matchesTargeting(ad.adSet, viewer)) return false
      const remaining = ad.adSet.dailyBudgetCents * 1000 - (spent.get(ad.adSetId) ?? 0)
      return remaining >= adChargeMillicents(objective, adFloorCents(objective))
    })

    // Ritmo: conjunto que gastou bem mais do que o relógio permite sai deste leilão, para o orçamento render o dia todo.
    const elapsed = dayElapsedFraction(now)
    const paced = eligible.filter(
      (ad) => random() < pacingChance({ spentMillicents: spent.get(ad.adSetId) ?? 0, dailyBudgetMillicents: ad.adSet.dailyBudgetCents * 1000, elapsedFraction: elapsed }),
    )
    if (!paced.length) return null

    // Chance de clique medida de cada anúncio (anúncio novo é sorteado; veja `CTR_MODEL`).
    const ctrSince = dayAsDate(saoPauloDay(new Date(now.getTime() - CTR_MODEL.WINDOW_DAYS * 24 * HOUR_MS)))
    const [stats, prior] = await Promise.all([this.repo.clickStatsByAd(paced.map((ad) => ad.id), ctrSince), this.priorClickRate(ctrSince, now)])
    const candidates: (AuctionCandidate & { record: AdCandidateRecord })[] = paced.map((record) => {
      const seen = stats.get(record.id) ?? { impressions: 0, viewable: 0, clicks: 0, hides: 0 }
      return {
        adId: record.id,
        objective: record.adSet.campaign.objective,
        bidCapCents: record.adSet.bidCapCents,
        quality: qualityFactor(seen.hides, seen.impressions),
        clickRate: auctionClickRate(clickRatePosterior(seen.clicks, seen.viewable, prior), seen.viewable, random),
        record,
      }
    })
    const result = runAuction(candidates, random)
    if (!result) return null

    const { record } = result.winner as (typeof candidates)[number]
    const objective = record.adSet.campaign.objective
    const clickToken = newClickToken()
    const impression = await this.repo.createImpression({
      adId: record.id,
      adSetId: record.adSetId,
      userId,
      surface: query.surface,
      position: query.position ?? 0,
      chargeOn: adChargeUnit(objective),
      chargeMillicents: adChargeMillicents(objective, result.priceCents),
      clickToken,
      day,
    })

    const company = record.adSet.campaign.account.company
    return {
      impressionId: impression.id,
      adId: record.id,
      headline: record.creative.headline,
      body: record.creative.body,
      ctaLabel: record.creative.ctaLabel,
      destinationUrl: record.creative.destinationUrl,
      clickUrl: this.clickLinks.build(clickToken),
      media: creativeMediaItem(record.creative.media, (key) => this.storage.getPublicUrl(key)),
      advertiser: { id: company.id, name: company.tradeName, username: company.username, logoUrl: company.logoUrl },
      why: explainWhy(record, viewer),
    }
  }

  /** Chance de clique de partida: a medida na plataforma se já há exibições suficientes, senão a fixa. Nunca derruba a entrega. */
  private async priorClickRate(since: Date, now: Date): Promise<number> {
    if (this.platformPrior && now.getTime() - this.platformPrior.at < PLATFORM_PRIOR_TTL_MS) return this.platformPrior.value
    let value = PRIOR_CTR
    try {
      const total = await this.repo.platformClickStats(since)
      if (total.viewable >= CTR_MODEL.MIN_PLATFORM_VIEWABLE) value = Math.min(Math.max(total.clicks / total.viewable, 0.001), 0.2)
    } catch (error) {
      this.logger.warn(`Não consegui medir a chance de clique da plataforma, usando a fixa: ${error instanceof Error ? error.message : String(error)}`)
    }
    this.platformPrior = { value, at: now.getTime() }
    return value
  }

  /** Empresas que são alvo de relato nos itens em volta do espaço. `null` se a conferência falhou. */
  private async companiesNextToSlot(query: NextAdQueryDto): Promise<string[] | null> {
    if (!query.nearPostIds?.length && !query.nearReportIds?.length) return []
    try {
      return await this.adjacency.companiesTargetedNear({ postIds: query.nearPostIds, reportIds: query.nearReportIds })
    } catch (error) {
      this.logger.error(`Não consegui conferir o que está perto do espaço de anúncio: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /**
   * Recebe os eventos do aparelho. Cada um é conferido contra a entrega (que precisa ser desta pessoa) e as regras
   * de antifraude. Repetir o mesmo `eventId` não conta de novo; evento inválido fica guardado, mas nunca é cobrado.
   */
  async ingest(userId: string, batch: AdEventsBatchDto, now = new Date()): Promise<AdEventsResult> {
    const result: AdEventsResult = { accepted: 0, duplicates: 0, rejected: 0 }
    const day = saoPauloDay(now)

    for (const event of batch.events) {
      const impression = await this.repo.findImpression(event.impressionId)
      // Entrega que não existe, de outra pessoa ou de outro anúncio: ignora sem dar pista de qual foi o problema.
      if (!impression || impression.userId !== userId || impression.adId !== event.adId) {
        result.rejected += 1
        continue
      }

      const occurredAt = new Date(event.occurredAt)
      const clicks =
        event.type === 'CLICK' ? await this.repo.countClicks(userId, impression.adId, new Date(now.getTime() - 24 * HOUR_MS)) : 0
      const reason = validateEvent({ type: event.type, occurredAt, visibleMs: event.visibleMs }, impression, now, clicks)

      const applied = await this.repo.applyEvent({
        eventId: event.eventId,
        impressionId: impression.id,
        adId: impression.adId,
        adSetId: impression.ad.adSetId,
        accountId: impression.ad.adSet.campaign.accountId,
        companyId: impression.ad.adSet.campaign.account.companyId,
        userId,
        type: event.type,
        occurredAt,
        visibleMs: event.visibleMs ?? null,
        status: reason ? 'INVALID' : 'ACCEPTED',
        reason,
        now,
        day,
      })
      if (!applied) result.duplicates += 1
      else if (reason) result.rejected += 1
      else result.accepted += 1
    }
    return result
  }

  /** Relatório diário da conta (somado entre os anúncios). Só a empresa dona da conta enxerga. */
  async stats(companyId: string, accountId: string, days = 7): Promise<AdDailyStatView[]> {
    const account = await this.repo.findAccount(accountId)
    if (!account || account.companyId !== companyId) throw new NotFoundException('Conta de anúncios não encontrada.')
    const since = new Date(`${saoPauloDay(new Date(Date.now() - (days - 1) * 24 * HOUR_MS))}T00:00:00.000Z`)
    const rows = await this.repo.listAccountDailyStats(accountId, since)
    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      impressions: row._sum.impressions ?? 0,
      viewableImpressions: row._sum.viewableImpressions ?? 0,
      clicks: row._sum.clicks ?? 0,
      hides: row._sum.hides ?? 0,
      spendCents: Math.round((row._sum.spendMillicents ?? 0) / 1000),
      conversions: row._sum.conversions ?? 0,
      conversionValueCents: Number(row._sum.conversionValueCents ?? 0),
    }))
  }

  /** De hora em hora: lança no livro-caixa o gasto acumulado que já completou centavos. Pode rodar em mais de uma instância. */
  @Cron(CronExpression.EVERY_HOUR)
  async closeSpend(): Promise<number> {
    let closed = 0
    let accounts: { id: string }[] = []
    try {
      accounts = await this.repo.accountsWithPendingSpend()
    } catch (error) {
      this.logger.error(`Fechamento do gasto de anúncios falhou: ${error instanceof Error ? error.message : String(error)}`)
      return 0
    }
    // Uma conta com problema não impede o fechamento das outras.
    for (const account of accounts) {
      try {
        await this.repo.closeSpend(account.id)
        closed += 1
      } catch (error) {
        this.logger.error(`Fechamento do gasto da conta ${account.id} falhou: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return closed
  }
}

function buildViewer(
  facts: NonNullable<Awaited<ReturnType<AdsDeliveryRepository['findViewerFacts']>>>,
  query: NextAdQueryDto,
): Viewer {
  const consented = facts.adPreference?.personalizationConsent === true
  const age = facts.birthDate ? ageOn(facts.birthDate) : null
  // Menor de idade nunca é perfilado para anúncio (ECA Digital), mesmo com aceite no banco.
  const personalization = consented && !(age !== null && age < 18)
  return {
    // Região é contexto da tela. Só com aceite o cadastro pode completar o que a tela não informou.
    state: query.state?.toUpperCase() ?? (personalization ? facts.state : null),
    city: query.city ?? (personalization ? facts.city : null),
    personalization,
    interests: personalization ? (facts.adPreference?.interests ?? []) : [],
    ageBand: personalization ? ageBandOf(facts.birthDate) : null,
    gender: personalization ? (facts.gender ?? null) : null,
  }
}

/** "Por que estou vendo isto?" em português simples. Só diz o que de fato foi usado. */
function explainWhy(record: AdCandidateRecord, viewer: Viewer): string {
  const set = record.adSet
  const personal = !set.automaticAudience && (set.interests.length > 0 || set.ageBands.length > 0 || set.genders.length > 0)
  if (personal && viewer.personalization) {
    return 'Você ligou os anúncios personalizados, e esta empresa escolheu mostrar para pessoas com o seu perfil de interesses. Você pode mudar isso em Preferências de anúncios.'
  }
  if (set.cities.length || set.states.length) return 'Esta empresa escolheu mostrar este anúncio para pessoas da sua região.'
  return 'Esta empresa escolheu mostrar este anúncio para todo mundo no Votz.'
}
