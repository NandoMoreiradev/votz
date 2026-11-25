import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import {
  AD_DELIVERY,
  AD_DELIVERY_LIMITS,
  adChargeMillicents,
  adChargeUnit,
  adFloorCents,
  type AdDailyStatView,
  type AdEventsResult,
  type SponsoredAdView,
} from '@votz/shared-types'
import { ContentAdjacencyService } from '../../content-adjacency/content-adjacency.service'
import { StorageService } from '../../storage/storage.service'
import { creativeMediaItems, creativeMediaReady } from '../ad-creative-media'
import { AdsClickLinkService } from '../ads-conversions/ads-click-link.service'
import { newClickToken } from '../ads-conversions/conversion-rules'
import { AdsDeliveryRepository, type AdCandidateRecord, type AdStats, type AdvertiserStats, type ShadowDecisionRow } from './ads-delivery.repository'
import { DELIVERY_EXPERIMENTS, activeExperiment, assignArm, experimentLabel, type DeliveryExperiment, type DeliveryOverrides } from './experiments'
import { AdsPacingService, type PacingView } from './ads-pacing.service'
import { AdsUserStateService, type UserAdState } from './ads-user-state.service'
import { AdsViewerCacheService, viewerFactsFromRow, type ViewerFacts } from '../ads-viewer/ads-viewer-cache.service'
import { expectedSpendMillicents, viewableRate } from './pacing-controller'
import { AdEventsBatchDto, NextAdQueryDto } from './dto/ads-delivery.dto'
import {
  CTR_MODEL,
  advertiserRejectionRate,
  qualityFactor,
  PRIOR_CTR,
  auctionClickRate,
  clickRatePosterior,
  dayAsDate,
  dayElapsedFraction,
  ecpmOfPrice,
  explorationChance,
  isHoldout,
  matchesTargeting,
  pacingChance,
  pickAuctionPool,
  runAuction,
  saoPauloDay,
  saoPauloHour,
  targetingMismatch,
  validateEvent,
  type AuctionCandidate,
  type Viewer,
} from './delivery-rules'

const CANDIDATE_POOL = 200

/** Quem disputa o leilão, com o que a disputa precisa saber depois (ritmo e exploração). */
type PoolCandidate = AuctionCandidate & {
  record: AdCandidateRecord
  /** Pouca história: disputa em separado, sorteado (veja `EXPLORATION`). */
  isNew: boolean
  seen: AdStats
  /** Média da chance de clique (o sorteio de anúncio novo não entra aqui): o gasto esperado usa a média. */
  meanClickRate: number
}

const spentFromView = (view: Map<string, PacingView>): Map<string, number> => new Map([...view].map(([adSetId, item]) => [adSetId, item.estimatedSpentMillicents]))
const HOUR_MS = 3600_000
const PLATFORM_PRIOR_TTL_MS = 10 * 60_000
/** A qualidade de cada empresa muda devagar: guardada por 10 minutos. */
const ADVERTISER_TTL_MS = 10 * 60_000
/**
 * Conjunto de anúncios que podem entrar na disputa: a mesma consulta para todo mundo, guardada por poucos segundos e
 * compartilhada entre os pedidos simultâneos. Cada pessoa só tira o que é dela (escondidos, limite diário, vizinhança)
 * na memória. Custo do atraso: um anúncio pausado, editado ou sem saldo pode ser entregue por até este tempo; o
 * orçamento do dia e o saldo continuam sendo conferidos em cada pedido (ritmo e gasto), e gasto acima do saldo é
 * absorvido pelo Votz.
 */
const POOL_TTL_MS = 15_000
/** Contagem de cliques, exibições e rejeição de cada anúncio muda devagar: guardada por 1 minuto. */
const AD_STATS_TTL_MS = 60_000
/**
 * Tempo-limite da entrega (`ADS_DELIVERY_BUDGET_MS`, 0 desliga). O feed não espera anúncio: passou do tempo, devolve "sem
 * anúncio" e **não cria a exibição** (uma exibição criada depois de a pessoa ter ficado sem resposta contaria no limite
 * diário e no ritmo sem nunca poder ser vista). O plano pede p99 de 40 ms no serviço de anúncios dedicado; aqui, dentro
 * da API, o padrão é mais folgado porque o banco divide a conexão com o resto.
 */
const DEFAULT_BUDGET_MS = 250
const TIMEOUT_LOG_EVERY_MS = 10_000

/** A entrega passou do tempo-limite. Nunca sai da `AdsDeliveryService`. */
class DeliveryTimeout extends Error {
  constructor() {
    super('A entrega de anúncio passou do tempo-limite')
  }
}

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
  /** Taxa de rejeição (esconder e denúncia) de cada empresa, guardada por um tempo. */
  private readonly advertiserRates = new Map<string, { value: number; at: number }>()
  /** Conjunto de candidatos compartilhado (veja `POOL_TTL_MS`). */
  private poolCache: { at: number; promise: Promise<AdCandidateRecord[]> } | null = null
  /** Estatística de cada anúncio, guardada por um tempo (veja `AD_STATS_TTL_MS`). */
  private readonly adStatsCache = new Map<string, { value: AdStats; at: number }>()

  constructor(
    private readonly repo: AdsDeliveryRepository,
    private readonly storage: StorageService,
    private readonly clickLinks: AdsClickLinkService,
    private readonly adjacency: ContentAdjacencyService,
    /** Ritmo por minuto no Redis. Sem ele (ou com o Redis fora do ar) a entrega usa o ritmo pelo banco, como antes. */
    @Optional() private readonly pacing?: AdsPacingService,
    @Optional() private readonly config?: ConfigService,
    /** Escondidos e limite diário por pessoa no Redis. Sem ele (ou com o Redis fora do ar) a entrega consulta o banco, como antes. */
    @Optional() private readonly userState?: AdsUserStateService,
    /** Cópia curta do cadastro da pessoa no Redis. Sem ela (ou com o Redis fora do ar) a entrega lê o cadastro do banco, como antes. */
    @Optional() private readonly viewerCache?: AdsViewerCacheService,
  ) {}

  /** Cadastro da pessoa para a entrega: da cópia curta, senão do banco (a fonte da verdade). */
  private viewerFacts(userId: string): Promise<ViewerFacts | null> {
    const fromDb = async () => {
      const row = await this.repo.findViewerFacts(userId)
      return row ? viewerFactsFromRow(row) : null
    }
    return this.viewerCache ? this.viewerCache.get(userId, fromDb) : fromDb()
  }

  /** Experimentos A/B e de sombra ativos (nenhum por padrão; os testes e a prova trocam a lista). */
  experiments: readonly DeliveryExperiment[] = DELIVERY_EXPERIMENTS
  /** Quantas entregas passaram do tempo-limite desde que o processo subiu (para o log e a conferência). */
  timeouts = 0
  private lastTimeoutLog = 0

  /** Tempo-limite da entrega em ms (0 = sem limite). */
  budgetMs(): number {
    const raw = this.config?.get<string>('ADS_DELIVERY_BUDGET_MS')
    if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_BUDGET_MS
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_BUDGET_MS
  }

  /**
   * Explica em desenvolvimento por que ninguém ganhou (`ADS_DELIVERY_DEBUG`; sem a variável, liga só com `NODE_ENV=development`).
   * Em produção fica desligado: a explicação cita regras de alvo e nunca deve sair para o aparelho da pessoa.
   */
  debugEnabled(): boolean {
    // Em produção nunca: a explicação cita título e público de campanhas de outras empresas.
    if ((this.config?.get<string>('NODE_ENV') ?? process.env.NODE_ENV) === 'production') return false
    const raw = String(this.config?.get<string>('ADS_DELIVERY_DEBUG') ?? '').trim().toLowerCase()
    if (raw === 'true' || raw === '1') return true
    if (raw === 'false' || raw === '0') return false
    return (this.config?.get<string>('NODE_ENV') ?? process.env.NODE_ENV) === 'development'
  }

  /** Escolhe o anúncio da vez para esta pessoa (ou nenhum) e registra a entrega. Dentro do tempo-limite, ou "sem anúncio". */
  async next(userId: string, query: NextAdQueryDto, now = new Date(), random: () => number = Math.random): Promise<SponsoredAdView | null> {
    return (await this.nextWithReason(userId, query, now, random)).ad
  }

  /**
   * Igual a `next`, mas diz por que não saiu anúncio (`reason`, só com `debugEnabled()`), em português, para quem está
   * desenvolvendo. Também escreve o motivo no log (nível debug) quando está ligado.
   */
  async nextWithReason(
    userId: string,
    query: NextAdQueryDto,
    now = new Date(),
    random: () => number = Math.random,
  ): Promise<{ ad: SponsoredAdView | null; reason: string | null }> {
    const budget = this.budgetMs()
    const deadlineAt = budget > 0 ? performance.now() + budget : Number.POSITIVE_INFINITY
    const trace: NoAdTrace = { enabled: this.debugEnabled(), reason: null }
    let ad: SponsoredAdView | null = null
    try {
      ad = await this.deliver(userId, query, now, random, deadlineAt, trace)
    } catch (error) {
      if (!(error instanceof DeliveryTimeout)) throw error
      this.timeouts += 1
      const clock = Date.now()
      if (clock - this.lastTimeoutLog >= TIMEOUT_LOG_EVERY_MS) {
        this.lastTimeoutLog = clock
        this.logger.warn(`Entrega de anúncio passou de ${budget} ms e devolveu "sem anúncio" (${this.timeouts} desde que o processo subiu).`)
      }
      trace.reason = `passou do tempo-limite de ${budget} ms (ADS_DELIVERY_BUDGET_MS)`
    }
    if (!ad && trace.enabled) {
      trace.reason ??= 'sem motivo registrado'
      this.logger.log(`Sem anúncio para ${userId.slice(0, 8)} (${query.surface}, posição ${query.position ?? 0}): ${trace.reason}`)
    }
    return { ad, reason: ad ? null : trace.reason }
  }

  /** Espera `work` até o tempo-limite; depois disso desiste (a leitura segue no banco, sem efeito). */
  private async within<T>(work: Promise<T>, deadlineAt: number): Promise<T> {
    if (deadlineAt === Number.POSITIVE_INFINITY) return work
    work.catch(() => undefined) // se perdermos a corrida, o erro dela não pode virar "unhandled rejection"
    const remaining = deadlineAt - performance.now()
    if (remaining <= 0) throw new DeliveryTimeout()
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DeliveryTimeout()), remaining)
    })
    try {
      return await Promise.race([work, timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private async deliver(userId: string, query: NextAdQueryDto, now: Date, random: () => number, deadlineAt: number, trace: NoAdTrace): Promise<SponsoredAdView | null> {
    /** Sai sem anúncio e, em desenvolvimento, anota por quê (o texto só é montado se estiver ligado). */
    const none = (reason: () => string): null => {
      if (trace.enabled) trace.reason = reason()
      return null
    }
    if (isHoldout(userId, AD_DELIVERY_LIMITS.HOLDOUT_SHARE)) return none(() => `a pessoa está no grupo de controle (${AD_DELIVERY_LIMITS.HOLDOUT_SHARE * 100}% nunca vê anúncio, decidido pelo id)`)

    // Teste A/B ou modo sombra (nenhum ativo por padrão). A pessoa cai sempre no mesmo braço. No A/B ela é servida pelas
    // regras do braço; na sombra é servida pelo controle e os outros braços só calculam o que escolheriam.
    const experiment = activeExperiment(this.experiments, now)
    const arm = experiment ? assignArm(userId, experiment) : null
    const serving: DeliveryOverrides = experiment?.mode === 'AB' && arm ? arm.overrides : {}
    const label = experiment && arm ? experimentLabel(experiment, experiment.mode === 'AB' ? arm : experiment.arms[0]) : null
    const shadowArms = experiment?.mode === 'SHADOW' && arm ? experiment.arms.slice(1) : []

    // Nenhum anúncio perto de relato contra o próprio anunciante. Se não deu para conferir a vizinhança, não mostra:
    // errar para o lado de não exibir custa uma exibição; errar para o outro lado, a confiança no Votz.
    const nearCompanies = await this.within(this.companiesNextToSlot(query), deadlineAt)
    if (!nearCompanies) return none(() => 'não deu para conferir o que está perto do espaço (regra de vizinhança); na dúvida, não mostra')

    const since = new Date(now.getTime() - 24 * HOUR_MS)
    const candidates = await this.within(this.candidatePool(now), deadlineAt)
    // O cadastro vem de uma cópia curta no Redis, apagada sempre que a pessoa muda o perfil ou o aceite (retirar o aceite de
    // anúncios personalizados vale na hora). Escondidos e limite diário vêm da cópia por pessoa; sem as cópias, do banco.
    const [facts, cached] = await this.within(
      Promise.all([this.viewerFacts(userId), this.userStateOf(userId, candidates, since)]),
      deadlineAt,
    )
    if (!facts) return none(() => 'cadastro da pessoa não encontrado')
    const [hiddenCompanies, excludedAds] = cached
      ? [cached.hiddenCompanyIds, cached.excludedAdIds]
      : await this.within(
          Promise.all([this.repo.hiddenCompanyIds(userId), this.repo.excludedAdIds(userId, since, AD_DELIVERY.MAX_IMPRESSIONS_PER_USER_AD_DAY)]),
          deadlineAt,
        )
    const viewer = buildViewer(facts, query)
    const excludedCompanies = new Set([...hiddenCompanies, ...nearCompanies])
    const excludedAdIds = new Set(excludedAds)
    const pool = candidates.filter(
      (ad) =>
        !excludedAdIds.has(ad.id) &&
        !excludedCompanies.has(ad.adSet.campaign.account.companyId) &&
        // A consulta compartilhada já olhou o período, mas pode ter sido feita segundos atrás.
        !(ad.adSet.startAt && ad.adSet.startAt > now) &&
        !(ad.adSet.endAt && ad.adSet.endAt <= now),
    )
    if (!pool.length) {
      return none(() => {
        if (!candidates.length) return 'nenhum anúncio pode ser entregue agora no banco (precisa: anúncio aprovado, campanha ativa, conta com saldo, dentro do período e mídia pronta)'
        const hiddenAds = candidates.filter((ad) => excludedAdIds.has(ad.id)).length
        const hiddenCompanies = candidates.filter((ad) => excludedCompanies.has(ad.adSet.campaign.account.companyId)).length
        const outOfPeriod = candidates.filter((ad) => (ad.adSet.startAt && ad.adSet.startAt > now) || (ad.adSet.endAt && ad.adSet.endAt <= now)).length
        return `${candidates.length} anúncio(s) na disputa, todos fora para esta pessoa: ${hiddenAds} escondido(s) ou no limite de ${AD_DELIVERY.MAX_IMPRESSIONS_PER_USER_AD_DAY} exibições em 24 h, ${hiddenCompanies} de empresa escondida ou alvo de relato ao lado do espaço, ${outOfPeriod} fora do período`
      })
    }

    const day = saoPauloDay(now)
    const adSetIds = [...new Set(pool.map((ad) => ad.adSetId))]
    // Ritmo por minuto (Redis): freio recalculado uma vez por minuto e gasto estimado já com o que foi emprestado na entrega.
    // Se o Redis não está disponível, cai para o gasto cobrado no banco e o freio por faixa, como antes.
    const budgets = new Map(pool.map((ad) => [ad.adSetId, ad.adSet.dailyBudgetCents * 1000]))
    const pacingView = this.pacing
      ? await this.within(this.pacing.view(adSetIds.map((adSetId) => ({ adSetId, dailyBudgetMillicents: budgets.get(adSetId) ?? 0 })), day, now, (ids) => this.repo.spentTodayByAdSet(ids, day)), deadlineAt)
      : null
    const spent = pacingView ? spentFromView(pacingView) : await this.within(this.repo.spentTodayByAdSet(adSetIds, day), deadlineAt)

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

    if (!eligible.length) {
      return none(() => {
        const lines = pool.slice(0, 5).map((ad) => `"${ad.creative.headline}" (${ad.id.slice(0, 8)}): ${ineligibleReason(ad, viewer, spent) ?? 'ok'}`)
        const more = pool.length > lines.length ? ` (e mais ${pool.length - lines.length})` : ''
        return `${pool.length} anúncio(s) na disputa, nenhum serve para esta pessoa: ${lines.join('; ')}${more}`
      })
    }

    // Ritmo: conjunto que gastou mais do que a curva do dia permite sai deste leilão, para o orçamento render o dia todo.
    const elapsed = dayElapsedFraction(now)
    const paced = eligible.filter((ad) => {
      const view = pacingView?.get(ad.adSetId)
      const chance = view
        ? view.throttle
        : pacingChance({ spentMillicents: spent.get(ad.adSetId) ?? 0, dailyBudgetMillicents: ad.adSet.dailyBudgetCents * 1000, elapsedFraction: elapsed })
      return random() < chance
    })
    if (!paced.length) return none(() => `${eligible.length} anúncio(s) serviriam, mas o freio de ritmo do orçamento segurou todos neste pedido (o orçamento do dia está sendo gasto mais rápido que a curva)`)

    // Chance de clique medida de cada anúncio (anúncio novo é sorteado; veja `CTR_MODEL`).
    const ctrSince = dayAsDate(saoPauloDay(new Date(now.getTime() - CTR_MODEL.WINDOW_DAYS * 24 * HOUR_MS)))
    const [stats, prior, advertiserRates] = await this.within(
      Promise.all([
        this.adStats(paced.map((ad) => ad.id), ctrSince, now),
        this.priorClickRate(ctrSince, now),
        this.advertiserQuality(paced.map((ad) => ad.adSet.campaign.account.companyId), ctrSince, now),
      ]),
      deadlineAt,
    )
    // Dados de cada anúncio que não dependem do braço (o sorteio da chance de clique é um só: os braços da sombra comparam o mesmo sorteio).
    const base = paced.map((record) => {
      const seen: AdStats = stats.get(record.id) ?? { impressions: 0, viewable: 0, clicks: 0, hides: 0, reports: 0 }
      const posterior = clickRatePosterior(seen.clicks, seen.viewable, prior)
      return {
        record,
        seen,
        clickRate: auctionClickRate(posterior, seen.viewable, random),
        meanClickRate: posterior.mean,
        priorRate: advertiserRates.get(record.adSet.campaign.account.companyId),
        isNew: seen.viewable < CTR_MODEL.EXPLORE_BELOW_VIEWABLE,
      }
    })
    // Anúncio novo disputa em separado dos experientes, com teto e piso por hora (veja `EXPLORATION`).
    const hour = saoPauloHour(now)
    const mixed = base.some((item) => item.isNew) && base.some((item) => !item.isNew)
    const counters = mixed && this.pacing ? await this.within(this.pacing.explorationCounters(day, hour), deadlineAt) : null

    /** A disputa com os parâmetros de um braço. `coin` é o sorteio de explorar, o mesmo para todos os braços (comparação pareada). */
    const decide = (overrides: DeliveryOverrides, tieBreak: () => number, coin: number) => {
      const candidates: PoolCandidate[] = base.map((item) => ({
        adId: item.record.id,
        objective: item.record.adSet.campaign.objective,
        bidCapCents: item.record.adSet.bidCapCents,
        quality: qualityFactor(item.seen.hides, item.seen.impressions, {
          reports: item.seen.reports,
          priorRate: item.priorRate,
          reportWeight: overrides.reportWeight,
          weight: overrides.qualityWeight,
          maxPenalty: overrides.qualityMaxPenalty,
        }),
        clickRate: item.clickRate,
        record: item.record,
        isNew: item.isNew,
        seen: item.seen,
        meanClickRate: item.meanClickRate,
      }))
      const { pool: auctionPool, contested } = pickAuctionPool(candidates, explorationChance(counters, overrides.explorationTargetShare), () => coin)
      let outcome = runAuction(auctionPool, tieBreak)
      // O grupo sorteado não tinha ninguém que valesse (lance abaixo do piso): o outro grupo ainda pode ganhar.
      if (!outcome && contested) outcome = runAuction(candidates.filter((candidate) => !auctionPool.includes(candidate)), tieBreak)
      return { result: outcome, contested }
    }

    // O controle usa o sorteio de sempre (mesma ordem de chamadas de `random` de antes dos experimentos).
    const coin = mixed ? random() : 0.5
    const { result, contested } = decide(serving, random, coin)

    // Modo sombra: o que cada braço de teste teria escolhido com o mesmo sorteio. Só calcula; ninguém vê.
    const shadowRows: ShadowDecisionRow[] = shadowArms.map((testArm) => {
      const shadow = decide(testArm.overrides, () => 0.5, coin).result
      const servedAdId = result?.winner.adId ?? null
      const shadowAdId = shadow?.winner.adId ?? null
      return {
        experiment: experiment!.key,
        arm: testArm.key,
        servedAdId,
        shadowAdId,
        agreed: servedAdId === shadowAdId,
        servedEcpmCents: result ? ecpmOfPrice(result.winner.objective, result.priceCents, (result.winner as PoolCandidate).meanClickRate) : null,
        shadowEcpmCents: shadow ? ecpmOfPrice(shadow.winner.objective, shadow.priceCents, (shadow.winner as PoolCandidate).meanClickRate) : null,
      }
    })
    if (!result) {
      this.logShadow(shadowRows)
      return none(() => `${paced.length} anúncio(s) disputaram o leilão e nenhum valeu o piso de preço (o lance máximo fica abaixo do mínimo do objetivo)`)
    }

    // Última chance de desistir: depois de criada, a exibição conta no limite diário e no ritmo. Sem resposta, não se cria.
    if (performance.now() > deadlineAt) throw new DeliveryTimeout()
    const winner = result.winner as PoolCandidate
    const { record } = winner
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
      experiment: label,
    })
    this.logShadow(shadowRows)
    // A exibição entra na contagem do limite diário da pessoa (a cópia dela no Redis).
    await this.userState?.recordImpression(userId, record.id)

    if (this.pacing) {
      // O gasto esperado desta entrega entra já no ritmo (a cobrança só chega quando a pessoa vê ou clica) e a disputa entra nos contadores.
      const chargeMillicents = adChargeMillicents(objective, result.priceCents)
      await this.pacing.commit(
        record.adSetId,
        day,
        now,
        expectedSpendMillicents({ chargeMillicents, chargeOn: adChargeUnit(objective), viewableRate: viewableRate(winner.seen.viewable, winner.seen.impressions), clickRate: winner.meanClickRate }),
      )
      if (contested) await this.pacing.recordExploration(day, hour, winner.isNew)
    }

    const company = record.adSet.campaign.account.company
    const mediaItems = creativeMediaItems(record.creative.media, (key) => this.storage.getPublicUrl(key))
    return {
      impressionId: impression.id,
      adId: record.id,
      headline: record.creative.headline,
      body: record.creative.body,
      ctaLabel: record.creative.ctaLabel,
      // WhatsApp: o número da empresa não vai no anúncio do feed (nem para robô que leia a lista). Só o link do Votz, que leva ao
      // WhatsApp depois que a pessoa confirma.
      destinationUrl: record.creative.destinationKind === 'WHATSAPP' ? this.clickLinks.build(clickToken) : record.creative.destinationUrl,
      clickUrl: this.clickLinks.build(clickToken),
      clickId: clickToken,
      destination: record.creative.destinationKind === 'PAGE_MESSAGE' ? { kind: 'PAGE_MESSAGE', orgType: 'COMPANY', orgId: company.id } : { kind: record.creative.destinationKind },
      media: mediaItems[0] ?? null,
      mediaItems,
      advertiser: { id: company.id, name: company.tradeName, username: company.username, logoUrl: company.logoUrl },
      why: explainWhy(record, viewer),
    }
  }

  /**
   * Escondidos e limite diário da pessoa pela cópia no Redis (`null` se não há Redis). Só olha os anúncios que estão na
   * disputa; se a cópia faltar, é carregada do banco aqui.
   */
  private userStateOf(userId: string, candidates: AdCandidateRecord[], since: Date): Promise<UserAdState | null> {
    if (!this.userState) return Promise.resolve(null)
    return this.userState.load(userId, [...new Set(candidates.map((ad) => ad.id))], AD_DELIVERY.MAX_IMPRESSIONS_PER_USER_AD_DAY, async () => {
      const [hiddenCompanyIds, hiddenAdIds, impressionCounts24h] = await Promise.all([
        this.repo.hiddenCompanyIds(userId),
        this.repo.hiddenAdIds(userId),
        this.repo.impressionCounts(userId, since),
      ])
      return { hiddenCompanyIds, hiddenAdIds, impressionCounts24h }
    })
  }

  /** Grava as decisões da sombra sem atrasar a resposta; falhar aqui nunca atrapalha a entrega. */
  private logShadow(rows: ShadowDecisionRow[]): void {
    if (!rows.length) return
    this.repo.createShadowDecisions(rows).catch((error) => {
      this.logger.warn(`Não consegui gravar as decisões do modo sombra: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  /** O conjunto de candidatos, da memória se foi lido há pouco (e uma só leitura para os pedidos simultâneos). */
  private candidatePool(now: Date): Promise<AdCandidateRecord[]> {
    const cached = this.poolCache
    if (cached && now.getTime() - cached.at < POOL_TTL_MS) return cached.promise
    const promise = this.repo.findCandidates(now, [], [], CANDIDATE_POOL)
    this.poolCache = { at: now.getTime(), promise }
    // Se a leitura falhar, o próximo pedido tenta de novo em vez de guardar o erro.
    promise.catch(() => {
      if (this.poolCache?.promise === promise) this.poolCache = null
    })
    return promise
  }

  /** Estatística dos anúncios (cliques, exibições, rejeição), guardada por 1 minuto; só consulta o banco o que falta. */
  private async adStats(adIds: string[], since: Date, now: Date): Promise<Map<string, AdStats>> {
    const out = new Map<string, AdStats>()
    const missing: string[] = []
    for (const adId of adIds) {
      const cached = this.adStatsCache.get(adId)
      if (cached && now.getTime() - cached.at < AD_STATS_TTL_MS) out.set(adId, cached.value)
      else missing.push(adId)
    }
    if (missing.length) {
      const fresh = await this.repo.clickStatsByAd(missing, since)
      for (const adId of missing) {
        const value = fresh.get(adId) ?? { impressions: 0, viewable: 0, clicks: 0, hides: 0, reports: 0 }
        this.adStatsCache.set(adId, { value, at: now.getTime() })
        out.set(adId, value)
      }
    }
    return out
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

  /**
   * Taxa de rejeição de cada empresa (qualidade do anunciante), guardada por 10 minutos. Falha ao medir: vale a taxa
   * normal e a entrega segue.
   */
  private async advertiserQuality(companyIds: string[], since: Date, now: Date): Promise<Map<string, number>> {
    const unique = [...new Set(companyIds)]
    const out = new Map<string, number>()
    const missing: string[] = []
    for (const companyId of unique) {
      const cached = this.advertiserRates.get(companyId)
      if (cached && now.getTime() - cached.at < ADVERTISER_TTL_MS) out.set(companyId, cached.value)
      else missing.push(companyId)
    }
    if (missing.length) {
      let totals = new Map<string, AdvertiserStats>()
      try {
        totals = await this.repo.advertiserStats(missing, since)
      } catch (error) {
        this.logger.warn(`Não consegui medir a qualidade dos anunciantes, usando a taxa normal: ${error instanceof Error ? error.message : String(error)}`)
      }
      for (const companyId of missing) {
        const value = advertiserRejectionRate(totals.get(companyId))
        this.advertiserRates.set(companyId, { value, at: now.getTime() })
        out.set(companyId, value)
      }
    }
    return out
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
      else {
        result.accepted += 1
        // Escondeu um anúncio ou uma empresa: a cópia da pessoa no Redis é apagada e relida do banco no próximo pedido,
        // então o que ela escondeu nunca reaparece.
        if (event.type === 'HIDE' || event.type === 'HIDE_ADVERTISER') await this.userState?.invalidate(userId)
      }
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
      messageConversations: row._sum.messageConversations ?? 0,
    }))
  }

  /** Totais do período por anúncio da conta, para a tabela de campanhas. Só a empresa dona da conta enxerga. */
  async statsByAd(companyId: string, accountId: string, days = 7): Promise<AdStatsByAdView[]> {
    const account = await this.repo.findAccount(accountId)
    if (!account || account.companyId !== companyId) throw new NotFoundException('Conta de anúncios não encontrada.')
    const since = new Date(`${saoPauloDay(new Date(Date.now() - (days - 1) * 24 * HOUR_MS))}T00:00:00.000Z`)
    const rows = await this.repo.listAccountAdTotals(accountId, since)
    return rows.map((row) => ({
      adId: row.adId,
      impressions: row._sum.impressions ?? 0,
      viewableImpressions: row._sum.viewableImpressions ?? 0,
      clicks: row._sum.clicks ?? 0,
      hides: row._sum.hides ?? 0,
      spendCents: Math.round((row._sum.spendMillicents ?? 0) / 1000),
      conversions: row._sum.conversions ?? 0,
      conversionValueCents: Number(row._sum.conversionValueCents ?? 0),
      messageConversations: row._sum.messageConversations ?? 0,
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

/** Uma linha de `statsByAd`: os mesmos números do relatório diário, somados no período, de um anúncio. */
export interface AdStatsByAdView {
  adId: string
  impressions: number
  viewableImpressions: number
  clicks: number
  hides: number
  spendCents: number
  conversions: number
  conversionValueCents: number
  messageConversations: number
}

/** Anota por que ninguém ganhou, só em desenvolvimento (veja `AdsDeliveryService.debugEnabled`). */
interface NoAdTrace {
  enabled: boolean
  reason: string | null
}

/** Por que este anúncio não serve para esta pessoa agora (só para o log de desenvolvimento; as regras estão na entrega). */
function ineligibleReason(ad: AdCandidateRecord, viewer: Viewer, spent: Map<string, number>): string | null {
  const account = ad.adSet.campaign.account
  if (!creativeMediaReady(ad.creative.media)) return 'a mídia (vídeo) ainda não está pronta'
  if (account.balanceCents * 1000 - account.pendingSpendMillicents <= 0) return 'a conta não tem saldo'
  const mismatch = targetingMismatch(ad.adSet, viewer)
  if (mismatch) return `público não bate: ${mismatch}`
  const { objective } = ad.adSet.campaign
  const remaining = ad.adSet.dailyBudgetCents * 1000 - (spent.get(ad.adSetId) ?? 0)
  if (remaining < adChargeMillicents(objective, adFloorCents(objective))) return 'o orçamento do dia acabou'
  return null
}

function buildViewer(facts: ViewerFacts, query: NextAdQueryDto): Viewer {
  // Menor de idade nunca é perfilado para anúncio (ECA Digital), mesmo com aceite no banco.
  const personalization = facts.consented && !facts.minor
  return {
    // Região é contexto da tela. Só com aceite o cadastro pode completar o que a tela não informou.
    state: query.state?.toUpperCase() ?? (personalization ? facts.state : null),
    city: query.city ?? (personalization ? facts.city : null),
    personalization,
    interests: personalization ? facts.interests : [],
    ageBand: personalization ? facts.ageBand : null,
    gender: personalization ? facts.gender : null,
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
