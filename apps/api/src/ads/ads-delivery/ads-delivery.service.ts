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
import { StorageService } from '../../storage/storage.service'
import { creativeMediaItem, creativeMediaReady } from '../ad-creative-media'
import { AdsDeliveryRepository, type AdCandidateRecord } from './ads-delivery.repository'
import { AdEventsBatchDto, NextAdQueryDto } from './dto/ads-delivery.dto'
import {
  isHoldout,
  matchesTargeting,
  runAuction,
  saoPauloDay,
  validateEvent,
  type AuctionCandidate,
  type Viewer,
} from './delivery-rules'

const CANDIDATE_POOL = 200
const HOUR_MS = 3600_000

/**
 * Entrega de anúncios e contagem dos eventos (Etapa 2 do plano). A seleção é por contexto e regras, sem IA: o servidor
 * de anúncios com modelos chega na Etapa 3. As regras de privacidade já valem: sem aceite, só cidade e estado da
 * tela; faixa de idade, gênero e interesses só com aceite e para maiores de 18 anos.
 */
@Injectable()
export class AdsDeliveryService {
  private readonly logger = new Logger(AdsDeliveryService.name)

  constructor(
    private readonly repo: AdsDeliveryRepository,
    private readonly storage: StorageService,
  ) {}

  /** Escolhe o anúncio da vez para esta pessoa (ou nenhum) e registra a entrega. */
  async next(userId: string, query: NextAdQueryDto, now = new Date()): Promise<SponsoredAdView | null> {
    if (isHoldout(userId, AD_DELIVERY_LIMITS.HOLDOUT_SHARE)) return null

    const facts = await this.repo.findViewerFacts(userId)
    if (!facts) return null
    const viewer = buildViewer(facts, query)

    const since = new Date(now.getTime() - 24 * HOUR_MS)
    const [hiddenCompanies, excludedAds] = await Promise.all([
      this.repo.hiddenCompanyIds(userId),
      this.repo.excludedAdIds(userId, since, AD_DELIVERY.MAX_IMPRESSIONS_PER_USER_AD_DAY),
    ])
    const pool = await this.repo.findCandidates(now, hiddenCompanies, excludedAds, CANDIDATE_POOL)
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

    const candidates: (AuctionCandidate & { record: AdCandidateRecord })[] = eligible.map((record) => ({
      adId: record.id,
      objective: record.adSet.campaign.objective,
      bidCapCents: record.adSet.bidCapCents,
      record,
    }))
    const result = runAuction(candidates)
    if (!result) return null

    const { record } = result.winner as (typeof candidates)[number]
    const objective = record.adSet.campaign.objective
    const impression = await this.repo.createImpression({
      adId: record.id,
      adSetId: record.adSetId,
      userId,
      surface: query.surface,
      position: query.position ?? 0,
      chargeOn: adChargeUnit(objective),
      chargeMillicents: adChargeMillicents(objective, result.priceCents),
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
      media: creativeMediaItem(record.creative.media, (key) => this.storage.getPublicUrl(key)),
      advertiser: { id: company.id, name: company.tradeName, username: company.username, logoUrl: company.logoUrl },
      why: explainWhy(record, viewer),
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
