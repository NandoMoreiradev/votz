import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common'
import DOMPurify from 'isomorphic-dompurify'
import { ReportsRepository } from './reports.repository'
import { TimelineService } from '../timeline/timeline.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AlertsService } from '../alerts/alerts.service'
import { CreateReportDto } from './dto/create-report.dto'
import { UpdateStatusDto } from './dto/update-status.dto'
import { DisputeDto } from './dto/dispute.dto'
import { DisputeResolution, ResolveDisputeDto } from './dto/resolve-dispute.dto'
import { Category, EventType, RecipientType, ReportStatus, UserType } from '@votz/shared-types'
import { FollowerActorType } from '@prisma/client'

@Injectable()
export class ReportsService {
  constructor(
    private readonly repository: ReportsRepository,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationsService,
    private readonly alerts: AlertsService,
  ) {}

  async create(dto: CreateReportDto, user: { id: string; type: string; emailVerified: boolean }) {
    if (!user.emailVerified) throw new BadRequestException('Email verification required to create reports')

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

    return report
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
