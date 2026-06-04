import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import DOMPurify from 'isomorphic-dompurify'
import { ReportsRepository, SimilarReportRow } from './reports.repository'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AlertsService } from '../alerts/alerts.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { CreateReportDto } from './dto/create-report.dto'
import { UpdateStatusDto } from './dto/update-status.dto'
import { UpdateRecipientDto } from './dto/update-recipient.dto'
import { DisputeDto } from './dto/dispute.dto'
import { DisputeResolution, ResolveDisputeDto } from './dto/resolve-dispute.dto'
import { Category, EventType, RecipientType, ReportStatus, UserType } from '@votz/shared-types'
import { FollowerActorType, PoliticianStatus } from '@prisma/client'
import { REPORTS_QUEUE, GenerateEmbeddingJob } from './jobs/generate-embedding.processor'

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
    @InjectQueue(REPORTS_QUEUE) private readonly reportsQueue: Queue,
  ) {}

  async create(dto: CreateReportDto, user: { id: string; type: string; emailVerified: boolean }) {
    if (!user.emailVerified) throw new BadRequestException('Email verification required to create reports')

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

    // Fire-and-forget: gera embedding semântico para busca por similaridade
    this.reportsQueue.add(
      'generate-embedding',
      { reportId: report.id, text: `${cleanTitle} ${sanitizedDescription}` } satisfies GenerateEmbeddingJob,
      { removeOnComplete: 10, removeOnFail: 5, attempts: 3, backoff: { type: 'exponential', delay: 2_000 } },
    ).catch(() => null)

    return report
  }

  async findSimilar(title: string, description?: string, limit = 5) {
    const text = [title, description].filter(Boolean).join(' ')

    const [trgmResult, ftsResult, semanticResult] = await Promise.allSettled([
      this.repository.findByTrigram(title, description ?? '', limit),
      this.repository.findByFullText(text, limit),
      this.embedding.embed(text).then(vec => this.repository.findByEmbedding(vec, limit)),
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
    if (!report) throw new NotFoundException('Report not found')
    return report
  }

  async findAll(filters: {
    category?: Category
    status?: ReportStatus
    city?: string
    state?: string
    page: number
    limit: number
  }) {
    const { reports, total } = await this.repository.findAll(filters)
    const data = reports.map(({ timeline, ...r }) => ({
      ...r,
      advocacy: timeline[0] ?? null,
    }))
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

  async updateStatus(
    reportId: string,
    dto: UpdateStatusDto,
    user: { id: string; type: string },
  ) {
    const report = await this.repository.findById(reportId)
    if (!report) throw new NotFoundException('Report not found')

    const userType = user.type as UserType
    const isModAdmin = userType === UserType.MODERATOR || userType === UserType.ADMIN

    let isRecipient = false
    let actorId: string | null = null

    if (userType === UserType.ENTITY) {
      const entity = await this.repository.findEntityByUserId(user.id)
      if (entity) {
        actorId = entity.id
        isRecipient = report.recipientType === RecipientType.ENTITY && report.recipientId === entity.id
      }
    } else if (userType === UserType.POLITICIAN) {
      const politician = await this.repository.findPoliticianByUserId(user.id)
      if (politician) {
        if (politician.status !== PoliticianStatus.ATIVO) {
          throw new ForbiddenException('Este político não possui mandato ativo')
        }
        actorId = politician.id
        isRecipient = report.recipientType === RecipientType.POLITICIAN && report.recipientId === politician.id
      }
    } else if (!isModAdmin) {
      throw new ForbiddenException('Não autorizado')
    }

    const hasAdvocated = actorId
      ? report.timeline?.some(
          (e) =>
            e.type === EventType.RESPONDED &&
            (e.metadata as Record<string, unknown>)?.action === 'advocated' &&
            ((e.metadata as Record<string, unknown>)?.politicianId === actorId ||
              (e.metadata as Record<string, unknown>)?.entityId === actorId),
        ) ?? false
      : false

    if (!isRecipient && !hasAdvocated && !isModAdmin) {
      throw new ForbiddenException('Você não é destinatário nem avocou este relato')
    }

    // Apenas o destinatário (ou mod/admin) pode trocar o status
    if (dto.status !== undefined && !isRecipient && !isModAdmin) {
      throw new ForbiddenException('Apenas o destinatário pode alterar o status do relato')
    }

    const sanitizedContent = DOMPurify.sanitize(dto.content)

    if (dto.status !== undefined) {
      await this.repository.updateStatus(reportId, dto.status as unknown as ReportStatus)
      await this.timeline.record({
        reportId,
        type: EventType.STATUS_CHANGED,
        content: sanitizedContent,
        authorId: user.id,
        metadata: { previousStatus: report.status, newStatus: dto.status, media: dto.media ?? [] },
      })
      // Notificar sobre mudança de status
      if (report.author?.id && report.author.id !== user.id) {
        this.notifications.notify({
          userId: report.author.id,
          type: 'STATUS_CHANGED',
          reportId,
          metadata: { previousStatus: report.status, newStatus: dto.status },
        }).catch(() => null)
      }
      this.repository.getFollowerUserIds(reportId).then(userIds => {
        for (const userId of userIds) {
          if (userId !== user.id && userId !== report.author?.id) {
            this.notifications.notify({
              userId,
              type: 'STATUS_CHANGED',
              reportId,
              metadata: { previousStatus: report.status, newStatus: dto.status },
            }).catch(() => null)
          }
        }
      }).catch(() => null)
      return await this.repository.findById(reportId)
    }

    // Atualização informacional sem troca de status
    await this.timeline.record({
      reportId,
      type: EventType.UPDATE,
      content: sanitizedContent,
      authorId: user.id,
      metadata: { media: dto.media ?? [] },
    })
    return { id: reportId, status: report.status }
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

    return this.repository.findById(reportId)
  }

  // ── Follow ───────────────────────────────────────────────────────────────────

  async follow(reportId: string, userId: string, userType: string) {
    const report = await this.repository.findById(reportId)
    if (!report) throw new NotFoundException('Relato não encontrado')

    if (userType === UserType.POLITICIAN) {
      const politician = await this.repository.findPoliticianByUserId(userId)
      if (!politician) throw new ForbiddenException('Perfil de político não encontrado')
      await this.repository.addFollower(reportId, FollowerActorType.POLITICIAN, politician.id)
      return { following: true, actorType: 'POLITICIAN', actorId: politician.id }
    }

    if (userType === UserType.ENTITY) {
      const entity = await this.repository.findEntityByUserId(userId)
      if (!entity) throw new ForbiddenException('Perfil de entidade não encontrado')
      await this.repository.addFollower(reportId, FollowerActorType.ENTITY, entity.id)
      return { following: true, actorType: 'ENTITY', actorId: entity.id }
    }

    throw new ForbiddenException('Apenas políticos e entidades podem acompanhar relatos')
  }

  async unfollow(reportId: string, userId: string, userType: string) {
    if (userType === UserType.POLITICIAN) {
      const politician = await this.repository.findPoliticianByUserId(userId)
      if (!politician) throw new ForbiddenException('Perfil de político não encontrado')
      await this.repository.removeFollower(reportId, FollowerActorType.POLITICIAN, politician.id)
    } else if (userType === UserType.ENTITY) {
      const entity = await this.repository.findEntityByUserId(userId)
      if (!entity) throw new ForbiddenException('Perfil de entidade não encontrado')
      await this.repository.removeFollower(reportId, FollowerActorType.ENTITY, entity.id)
    } else {
      throw new ForbiddenException('Apenas políticos e entidades podem acompanhar relatos')
    }
    return { following: false }
  }

  async getFollowStatus(reportId: string, userId: string, userType: string) {
    if (userType === UserType.POLITICIAN) {
      const politician = await this.repository.findPoliticianByUserId(userId)
      if (!politician) return { following: false }
      const f = await this.repository.findFollower(reportId, FollowerActorType.POLITICIAN, politician.id)
      return { following: !!f }
    }
    if (userType === UserType.ENTITY) {
      const entity = await this.repository.findEntityByUserId(userId)
      if (!entity) return { following: false }
      const f = await this.repository.findFollower(reportId, FollowerActorType.ENTITY, entity.id)
      return { following: !!f }
    }
    return { following: false }
  }

  getFollowers(reportId: string) {
    return this.repository.getFollowers(reportId)
  }

  async dispute(reportId: string, dto: DisputeDto, userId: string) {
    const report = await this.repository.findById(reportId)
    if (!report) throw new NotFoundException('Report not found')

    if (report.status !== ReportStatus.RESOLVED) {
      throw new BadRequestException('Only resolved reports can be disputed')
    }

    if (report.anonymous) {
      throw new BadRequestException('Anonymous reports cannot be disputed')
    }

    const authorId = await this.repository.findAuthorId(reportId)
    if (authorId !== userId) {
      throw new ForbiddenException('Only the report author can dispute it')
    }

    const alreadyDisputed = report.timeline?.some((e) => e.type === EventType.DISPUTED)
    if (alreadyDisputed) {
      throw new BadRequestException('This report has already been disputed')
    }

    const sanitizedReason = DOMPurify.sanitize(dto.reason)
    await this.repository.setDisputed(reportId)

    await this.timeline.record({
      reportId,
      type: EventType.DISPUTED,
      content: sanitizedReason,
      authorId: userId,
      metadata: { evidence: dto.evidence ?? [] },
    })

    return { id: reportId, status: ReportStatus.DISPUTED }
  }

  async resolveDispute(reportId: string, dto: ResolveDisputeDto, user: { id: string; type: string }) {
    const allowedTypes = [UserType.MODERATOR, UserType.ADMIN]
    if (!allowedTypes.includes(user.type as UserType)) {
      throw new ForbiddenException('Only moderators and admins can resolve disputes')
    }

    const report = await this.repository.findById(reportId)
    if (!report) throw new NotFoundException('Report not found')

    if (report.status !== ReportStatus.DISPUTED) {
      throw new BadRequestException('Report is not in disputed status')
    }

    const newStatus =
      dto.decision === DisputeResolution.REOPEN ? ReportStatus.OPEN : ReportStatus.RESOLVED

    const sanitizedJustification = DOMPurify.sanitize(dto.justification)
    const updated = await this.repository.resolveDispute(reportId, newStatus)

    await this.timeline.record({
      reportId,
      type: EventType.STATUS_CHANGED,
      content: sanitizedJustification,
      authorId: user.id,
      metadata: { decision: dto.decision, previousStatus: ReportStatus.DISPUTED, newStatus },
    })

    const authorId = await this.repository.findAuthorId(reportId)
    if (authorId) {
      this.notifications.notify({
        userId: authorId,
        type: 'STATUS_CHANGED',
        reportId,
        metadata: { decision: dto.decision, newStatus },
      }).catch(() => null)
    }

    return updated
  }
}
