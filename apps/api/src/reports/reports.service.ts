import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Optional } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import DOMPurify from 'isomorphic-dompurify'
import { ReportsRepository, SimilarReportFilters, SimilarReportRow } from './reports.repository'
import { TtlCache } from '../imprensa/ttl-cache'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AlertsService } from '../alerts/alerts.service'
import { AlertRulesService } from '../alerts/alert-rules.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { StorageService } from '../storage/storage.service'
import { ReportMediaService } from '../storage/report-media.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import { TopicsService } from '../topics/topics.service'
import { ContentSafetyService } from '../content-safety/content-safety.service'
import { CreateReportDto } from './dto/create-report.dto'
import { UpdateStatusDto } from './dto/update-status.dto'
import { UpdateRecipientDto } from './dto/update-recipient.dto'
import { DisputeDto } from './dto/dispute.dto'
import { ResolveDisputeDto } from './dto/resolve-dispute.dto'
import { Category, EventType, RecipientType, ReportStatus, UserType, normalizeLocationKey } from '@votz/shared-types'
import { FollowerActorType, OrgPermission, OrgType, PoliticianStatus, WebhookEventType } from '@prisma/client'
import { REPORTS_QUEUE, GenerateEmbeddingJob } from './jobs/generate-embedding.processor'
import { ActingUser, requireActingOrg, resolveOptionalActingOrg } from '../auth/acting-org'
import { ReportLifecycleService } from '../report-lifecycle/report-lifecycle.service'

interface OrgCard {
  name: string
  avatarUrl: string | null
  subtitle: string | null
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name)

  constructor(
    private readonly repository: ReportsRepository,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationsService,
    private readonly alerts: AlertsService,
    private readonly embedding: EmbeddingService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(REPORTS_QUEUE) private readonly reportsQueue: Queue,
    private readonly lifecycle: ReportLifecycleService,
    @Optional() private readonly alertRules?: AlertRulesService,
    @Optional() private readonly webhooks?: WebhooksService,
    @Optional() private readonly topics?: TopicsService,
    @Optional() private readonly reportMedia?: ReportMediaService,
    @Optional() private readonly contentSafety?: ContentSafetyService,
  ) {}

  /** Compara nomes sem olhar maiúsculas, acentos, hífen ou apóstrofo ("Santa Bárbara d'Oeste" = "SANTA BARBARA D OESTE"). */
  private placeKey(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  }

  private readonly cityKeysByState = new Map<string, { loadedAt: number; keys: Set<string> }>()
  private static readonly CITY_CACHE_MS = 60 * 60 * 1000
  private readonly similarEmbeddingCache = new TtlCache(300)
  private static readonly SIMILAR_EMBEDDING_CACHE_MS = 5 * 60 * 1000

  private async knownCityKeys(state: string): Promise<Set<string>> {
    const cached = this.cityKeysByState.get(state)
    if (cached && Date.now() - cached.loadedAt < ReportsService.CITY_CACHE_MS) return cached.keys
    // O sync do IBGE grava cada município como entidade (com ibgeCode); é a lista oficial de cidades que já temos.
    const rows = await this.prisma.entity.findMany({
      where: { state, ibgeCode: { not: null } },
      select: { city: true },
    })
    const keys = new Set(rows.map((row) => this.placeKey(row.city ?? '')).filter(Boolean))
    this.cityKeysByState.set(state, { loadedAt: Date.now(), keys })
    return keys
  }

  /**
   * A cidade precisa existir na UF informada: ela liga o relato aos alertas de surto e às regras das entidades,
   * e um nome errado deixa o relato de fora sem ninguém perceber. Sem a lista (sync do IBGE ainda não rodou
   * para essa UF), não bloqueia ninguém.
   */
  private async assertKnownCity(city?: string, state?: string): Promise<void> {
    if (!city || !state) return
    const keys = await this.knownCityKeys(state)
    if (keys.size === 0 || keys.has(this.placeKey(city))) return
    throw new BadRequestException(`Não encontramos "${city}" em ${state}. Escolha a cidade na lista ou confira o estado.`)
  }

  async create(dto: CreateReportDto, user: { id: string; type: string; emailVerified: boolean }) {
    if (!user.emailVerified) throw new BadRequestException('Email verification required to create reports')
    this.storage.assertOwnStorageUrls(dto.media, 'reports')
    // Confere que os arquivos são da própria pessoa e já os marca: quem erra a cidade e reenvia usa os mesmos
    // arquivos. Quem desiste fica sem anexar e o arquivo é apagado pela limpeza, que só olha o que nunca foi marcado.
    await this.reportMedia?.attach(dto.media, user.id)
    await this.assertKnownCity(dto.city, dto.state)

    if (dto.recipientType === RecipientType.POLITICIAN && dto.recipientId) {
      const politician = await this.prisma.politician.findUnique({
        where: { id: dto.recipientId },
        select: { status: true },
      })
      if (!politician) throw new BadRequestException('Político destinatário não encontrado')
      if (politician.status !== PoliticianStatus.ATIVO) {
        throw new BadRequestException('Este político não possui mandato ativo e não pode receber novos relatos')
      }
    }

    const sanitizedDescription = DOMPurify.sanitize(dto.description)
    const cleanTitle = DOMPurify.sanitize(dto.title).trim().replace(/\s+/g, ' ')

    // Camada 1: bloqueia palavrões pesados, ódio, ameaça explícita e CPF exposto antes de gravar
    this.contentSafety?.assertCleanOrThrow([cleanTitle, sanitizedDescription], 'relato')

    const report = await this.repository.create(
      { ...dto, title: cleanTitle, description: sanitizedDescription },
      dto.anonymous ? null : user.id,
    )

    await this.timeline.record({
      reportId: report.id,
      type: EventType.CREATED,
      content: 'Relato registrado na plataforma Votz.',
      authorId: dto.anonymous ? null : user.id,
    })

    // Fire-and-forget: detecta surto após novo relato registrado
    if (report.city) {
      this.alerts.enqueueCheck(report.category, report.city, report.state ?? '').catch(() => null)
    }

    // Fire-and-forget: notifica in-app/push o destinatário do relato (Político, Entidade, Empresa ou Filial)
    if (report.recipientType && report.recipientId) {
      this.notifications
        .notifyRecipient?.(report.recipientType, report.recipientId, {
          type: 'NEW_REPORT_RECEIVED',
          reportId: report.id,
          metadata: {
            reportTitle: report.title,
            category: report.category,
            city: report.city,
            state: report.state,
          },
          excludeUserIds: [user.id],
        })
        ?.catch(() => null)
    }

    // Fire-and-forget: avalia regras de alerta configuráveis e webhooks de novo relato
    this.alertRules?.enqueueReportRuleCheck(report.id).catch(() => null)
    if (
      (report.recipientType === RecipientType.POLITICIAN ||
        report.recipientType === RecipientType.ENTITY) &&
      report.recipientId
    ) {
      this.webhooks
        ?.enqueueEvent(
          report.recipientType === RecipientType.POLITICIAN ? OrgType.POLITICIAN : OrgType.ENTITY,
          report.recipientId,
          WebhookEventType.REPORT_CREATED,
          `report.created:${report.id}`,
          {
            reportId: report.id,
            title: report.title,
            category: report.category,
            status: report.status,
            city: report.city,
            state: report.state,
            createdAt: report.createdAt,
          },
        )
        .catch(() => null)
    }

    // Fire-and-forget: gera embedding semântico para busca por similaridade
    this.reportsQueue.add(
      'generate-embedding',
      { reportId: report.id, text: `${cleanTitle} ${sanitizedDescription}` } satisfies GenerateEmbeddingJob,
      { removeOnComplete: 10, removeOnFail: 5, attempts: 3, backoff: { type: 'exponential', delay: 2_000 } },
    ).catch(() => null)

    this.topics?.syncReportTopics(report.id, `${cleanTitle} ${sanitizedDescription}`).catch(() => null)

    // Camada 2: triagem assíncrona por IA (pode abrir sinalização automática ou quarentena)
    this.contentSafety
      ?.enqueueReview({ targetType: 'REPORT', targetId: report.id, texts: [cleanTitle, sanitizedDescription] })
      .catch(() => null)

    return report
  }

  async findSimilar(
    title: string,
    description?: string,
    limit = 5,
    filters?: { category?: Category; state?: string; city?: string },
  ) {
    const cleanTitle = title.trim()
    const cleanDesc = description?.trim() ?? ''
    const text = [cleanTitle, cleanDesc].filter(Boolean).join(' ')
    const city = filters?.city?.trim().slice(0, 100) || undefined
    const state = filters?.state?.trim().toUpperCase() || undefined
    const repoFilters: SimilarReportFilters = {
      category: filters?.category,
      state: state && /^[A-Z]{2}$/.test(state) ? state : undefined,
      cityKey: city ? normalizeLocationKey(city) : undefined,
      cityLower: city?.toLowerCase(),
    }

    const embedKey = `sim:${text.replace(/\s+/g, ' ').toLowerCase()}`
    const [trgmResult, ftsResult, semanticResult] = await Promise.allSettled([
      this.repository.findByTrigram(cleanTitle, cleanDesc, limit, repoFilters),
      this.repository.findByFullText(text, limit, repoFilters),
      this.similarEmbeddingCache
        .get(embedKey, ReportsService.SIMILAR_EMBEDDING_CACHE_MS, () => this.embedding.embed(text, 'query'))
        .then(vec => this.repository.findByEmbedding(vec, limit, undefined, repoFilters)),
    ])

    const scores = new Map<string, { row: SimilarReportRow; combined: number; sources: string[] }>()

    const merge = (results: SimilarReportRow[], source: string, weight: number) => {
      for (const row of results) {
        const existing = scores.get(row.id)
        if (existing) {
          existing.combined += row.score * weight
          existing.sources.push(source)
        } else {
          scores.set(row.id, { row, combined: row.score * weight, sources: [source] })
        }
      }
    }

    if (trgmResult.status === 'rejected') this.logger.warn(`findByTrigram failed: ${trgmResult.reason?.message}`)
    if (ftsResult.status === 'rejected') this.logger.warn(`findByFullText failed: ${ftsResult.reason?.message}`)
    if (semanticResult.status === 'rejected') this.logger.warn(`findByEmbedding failed: ${semanticResult.reason?.message}`)

    if (trgmResult.status === 'fulfilled') merge(trgmResult.value, 'trigram', 1)
    if (ftsResult.status === 'fulfilled') merge(ftsResult.value, 'fulltext', 1)
    if (semanticResult.status === 'fulfilled') merge(semanticResult.value, 'semantic', 1.5)

    return Array.from(scores.values())
      .sort((a, b) => b.combined - a.combined)
      .slice(0, limit)
      .map(({ row, combined, sources }) => ({ ...row, score: combined, sources }))
  }

  async findById(id: string) {
    const report = await this.repository.findById(id)
    // Relato oculto pela moderação não aparece para o público, nem pelo link direto.
    if (!report || report.moderationStatus === 'HIDDEN') throw new NotFoundException('Relato não encontrado.')
    // Tamanho e moldura de cada foto e vídeo (o relato aparece inteiro, sem recorte: é prova).
    const mediaItems = this.reportMedia ? await this.reportMedia.itemsFor(report.media) : []
    const { moderationStatus: _moderation, advocacies, timeline, ...rest } = report
    const orgs = await this.loadOrgCards(report, advocacies, timeline)
    return {
      ...rest,
      mediaItems,
      advocacies: advocacies.map((a) => {
        const card = orgs.get(`${a.orgType}:${a.orgId}`)
        return {
          orgType: a.orgType,
          orgId: a.orgId,
          name: card?.name ?? (a.orgType === 'POLITICIAN' ? 'Político' : 'Entidade'),
          avatarUrl: card?.avatarUrl ?? null,
          subtitle: card?.subtitle ?? null,
          message: a.message,
          promisedFor: a.promisedFor,
          createdAt: a.createdAt,
          closedAt: a.closedAt,
          closedReason: a.closedReason,
        }
      }),
      timeline: await this.publicTimeline(report, timeline, orgs),
    }
  }

  /**
   * Na Memória pública quem fala é a instituição: o nome da pessoa da equipe (ou do moderador) fica só
   * no registro interno. Eventos antigos sem a organização gravada são atribuídos ao destinatário quando
   * quem escreveu é membro dele.
   */
  private async publicTimeline(
    report: { id: string; anonymous: boolean; recipientType: string | null; recipientId: string | null; author: { id: string } | null },
    timeline: Array<{ id: string; type: string; content: string; metadata: unknown; createdAt: Date; author: { id: string; name: string; avatarUrl: string | null } | null }>,
    orgs: Map<string, OrgCard>,
  ) {
    const legacyAuthors = new Set<string>()
    for (const e of timeline) {
      const meta = (e.metadata ?? {}) as Record<string, unknown>
      if (!e.author || meta.orgType || meta.politicianId || meta.entityId || meta.actorRole || meta.decision) continue
      if (e.type === 'CREATED' || e.type === 'DISPUTED') continue
      if (report.author && e.author.id === report.author.id) continue
      legacyAuthors.add(e.author.id)
    }
    let recipientMembers = new Set<string>()
    if (legacyAuthors.size > 0 && report.recipientId && (report.recipientType === 'POLITICIAN' || report.recipientType === 'ENTITY')) {
      const rows = await this.prisma.orgMembership.findMany({
        where: { orgType: report.recipientType as OrgType, orgId: report.recipientId, userId: { in: [...legacyAuthors] } },
        select: { userId: true },
      })
      recipientMembers = new Set(rows.map((r) => r.userId))
    }
    const recipientCard = report.recipientId ? orgs.get(`${report.recipientType}:${report.recipientId}`) : undefined

    return timeline.map((e) => {
      const { disputerUserId: _hidden, ...meta } = (e.metadata ?? {}) as Record<string, unknown>
      const orgKey = meta.orgType && meta.orgId
        ? `${meta.orgType}:${meta.orgId}`
        : meta.politicianId
          ? `POLITICIAN:${meta.politicianId}`
          : meta.entityId
            ? `ENTITY:${meta.entityId}`
            : null
      let actorOrg: { type: 'POLITICIAN' | 'ENTITY' | 'MODERATION'; id: string | null; name: string; avatarUrl?: string | null } | null = null
      if (meta.actorRole === 'MODERATION' || meta.action === 'dispute_decided' || meta.decision) {
        actorOrg = { type: 'MODERATION', id: null, name: 'Moderação do Votz', avatarUrl: null }
      } else if (orgKey) {
        const card = orgs.get(orgKey)
        const [type, id] = orgKey.split(':') as ['POLITICIAN' | 'ENTITY', string]
        actorOrg = { type, id, name: card?.name ?? (typeof meta.orgName === 'string' ? meta.orgName : 'Instituição'), avatarUrl: card?.avatarUrl ?? null }
      } else if (e.author && recipientMembers.has(e.author.id) && recipientCard && report.recipientId) {
        actorOrg = {
          type: report.recipientType as 'POLITICIAN' | 'ENTITY',
          id: report.recipientId,
          name: recipientCard.name,
          avatarUrl: recipientCard.avatarUrl,
        }
      }
      // Em relato anônimo, a contestação não mostra quem contestou.
      const hideAuthor = !!actorOrg || (e.type === 'DISPUTED' && report.anonymous)
      return { ...e, metadata: meta, author: hideAuthor ? null : e.author, actorOrg }
    })
  }

  private async loadOrgCards(
    report: { recipientType: string | null; recipientId: string | null },
    advocacies: Array<{ orgType: string; orgId: string }>,
    timeline: Array<{ metadata: unknown }>,
  ): Promise<Map<string, OrgCard>> {
    const politicianIds = new Set<string>()
    const entityIds = new Set<string>()
    const add = (type: unknown, id: unknown) => {
      if (typeof id !== 'string' || !id) return
      if (type === 'POLITICIAN') politicianIds.add(id)
      else if (type === 'ENTITY') entityIds.add(id)
    }
    add(report.recipientType, report.recipientId)
    advocacies.forEach((a) => add(a.orgType, a.orgId))
    for (const e of timeline) {
      const m = (e.metadata ?? {}) as Record<string, unknown>
      add(m.orgType, m.orgId)
      add('POLITICIAN', m.politicianId)
      add('ENTITY', m.entityId)
    }
    const [politicians, entities] = await Promise.all([
      politicianIds.size
        ? this.prisma.politician.findMany({
            where: { id: { in: [...politicianIds] } },
            select: { id: true, name: true, avatarUrl: true, office: true, state: true, city: true },
          })
        : Promise.resolve([]),
      entityIds.size
        ? this.prisma.entity.findMany({
            where: { id: { in: [...entityIds] } },
            select: { id: true, legalName: true, logoUrl: true, city: true, state: true },
          })
        : Promise.resolve([]),
    ])
    const map = new Map<string, OrgCard>()
    for (const p of politicians) {
      map.set(`POLITICIAN:${p.id}`, {
        name: p.name,
        avatarUrl: p.avatarUrl,
        subtitle: [p.office, p.city ?? p.state].filter(Boolean).join(' · ') || null,
      })
    }
    for (const e of entities) {
      map.set(`ENTITY:${e.id}`, {
        name: e.legalName,
        avatarUrl: e.logoUrl,
        subtitle: [e.city, e.state].filter(Boolean).join('/') || null,
      })
    }
    return map
  }

  async findAll(filters: {
    category?: Category
    status?: ReportStatus
    city?: string
    state?: string
    search?: string
    page: number
    limit: number
  }) {
    const { reports, total } = await this.repository.findAll(filters)
    const firstAdvocacies = reports.map((r) => r.advocacies[0]).filter(Boolean)
    const orgs = await this.loadOrgCards({ recipientType: null, recipientId: null }, firstAdvocacies, [])
    const data = reports.map(({ advocacies, ...r }) => {
      const a = advocacies[0]
      const card = a ? orgs.get(`${a.orgType}:${a.orgId}`) : undefined
      return {
        ...r,
        // Selo "avocado por": a instituição que avocou primeiro (formato antigo mantido: author + createdAt).
        advocacy: a
          ? {
              orgType: a.orgType,
              orgId: a.orgId,
              createdAt: a.createdAt,
              author: { id: a.orgId, name: card?.name ?? 'Instituição', avatarUrl: card?.avatarUrl ?? null },
            }
          : null,
      }
    })
    return {
      data,
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    }
  }

  /** Mudar status ou publicar atualização: regra única em ReportLifecycleService. */
  updateStatus(reportId: string, dto: UpdateStatusDto, user: ActingUser) {
    return this.lifecycle.updateFromReportPage(reportId, dto, user)
  }

  async updateRecipient(reportId: string, dto: UpdateRecipientDto, userId: string) {
    const meta = await this.repository.findAuthorIdByReport(reportId)
    if (!meta) throw new NotFoundException('Relato não encontrado')
    if (meta.authorId !== userId) throw new ForbiddenException('Apenas o autor do relato pode reatribuir o destinatário')

    const ASSIGNABLE: ReportStatus[] = [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW, ReportStatus.IN_PROGRESS]
    if (!ASSIGNABLE.includes(meta.status as ReportStatus)) {
      throw new BadRequestException('Apenas relatos em aberto podem ter o destinatário reatribuído')
    }

    if (dto.recipientType === RecipientType.POLITICIAN) {
      const politician = await this.prisma.politician.findUnique({
        where: { id: dto.recipientId },
        select: { status: true },
      })
      if (!politician) throw new BadRequestException('Político destinatário não encontrado')
      if (politician.status !== PoliticianStatus.ATIVO) {
        throw new BadRequestException('Apenas políticos com mandato ativo podem ser destinatários')
      }
    }

    if (dto.recipientType === RecipientType.ENTITY) {
      const entity = await this.prisma.entity.findUnique({
        where: { id: dto.recipientId },
        select: { id: true },
      })
      if (!entity) throw new BadRequestException('Entidade destinatária não encontrada')
    }

    if (dto.recipientType === RecipientType.BRANCH) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.recipientId },
        select: { id: true },
      })
      if (!branch) throw new BadRequestException('Filial destinatária não encontrada')
    }

    await this.repository.updateRecipient(reportId, dto.recipientType, dto.recipientId)

    await this.timeline.record({
      reportId,
      type: EventType.UPDATE,
      content: 'Destinatário atualizado pelo autor. Relato reatribuído.',
      authorId: userId,
      metadata: {
        action: 'recipient_updated',
        previousRecipientType: meta.recipientType,
        previousRecipientId: meta.recipientId,
        newRecipientType: dto.recipientType,
        newRecipientId: dto.recipientId,
      },
    })

    const updated = await this.repository.findById(reportId)
    this.notifications
      .notifyRecipient?.(dto.recipientType, dto.recipientId, {
        type: 'REPORT_REASSIGNED',
        reportId,
        metadata: { reportTitle: updated?.title },
        excludeUserIds: [userId],
      })
      ?.catch(() => null)

    return updated
  }

  // ── Follow ───────────────────────────────────────────────────────────────────

  async follow(reportId: string, user: ActingUser) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.RESPOND_REPORTS,
    )
    const report = await this.prisma.report.findUnique({ where: { id: reportId }, select: { id: true, moderationStatus: true } })
    if (!report || report.moderationStatus === 'HIDDEN') throw new NotFoundException('Relato não encontrado.')
    if (acting.orgType === 'POLITICIAN') {
      const politician = await this.prisma.politician.findUnique({ where: { id: acting.orgId }, select: { status: true } })
      if (politician?.status !== PoliticianStatus.ATIVO) {
        throw new ForbiddenException('Este político não tem mandato ativo e não pode acompanhar relatos.')
      }
    }

    await this.repository.addFollower(reportId, acting.orgType as FollowerActorType, acting.orgId)
    return { following: true, actorType: acting.orgType, actorId: acting.orgId }
  }

  async unfollow(reportId: string, user: ActingUser) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.RESPOND_REPORTS,
    )
    await this.repository.removeFollower(reportId, acting.orgType as FollowerActorType, acting.orgId)
    return { following: false }
  }

  async getFollowStatus(reportId: string, user: ActingUser) {
    const acting = await resolveOptionalActingOrg(this.prisma, user, ['POLITICIAN', 'ENTITY'])
    if (!acting) return { following: false }
    const f = await this.repository.findFollower(
      reportId,
      acting.orgType as FollowerActorType,
      acting.orgId,
    )
    return { following: !!f }
  }

  getFollowers(reportId: string) {
    return this.repository.getFollowers(reportId)
  }

  dispute(reportId: string, dto: DisputeDto, userId: string) {
    return this.lifecycle.dispute(reportId, dto, userId)
  }

  resolveDispute(reportId: string, dto: ResolveDisputeDto, user: { id: string; type: string }) {
    return this.lifecycle.resolveDispute(reportId, dto, user)
  }

  confirmResolution(reportId: string, userId: string) {
    return this.lifecycle.confirmResolution(reportId, userId)
  }

  withdrawAdvocacy(reportId: string, user: ActingUser, reason: string) {
    return this.lifecycle.withdrawAdvocacy(reportId, user, reason)
  }

  disputeQueue(user: { type: string }, page?: number, limit?: number) {
    return this.lifecycle.disputeQueue(user, page, limit)
  }
}
