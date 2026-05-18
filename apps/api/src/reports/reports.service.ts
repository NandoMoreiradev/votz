import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import DOMPurify from 'isomorphic-dompurify'
import { ReportsRepository } from './reports.repository'
import { TimelineService } from '../timeline/timeline.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CreateReportDto } from './dto/create-report.dto'
import { UpdateStatusDto } from './dto/update-status.dto'
import { DisputeDto } from './dto/dispute.dto'
import { DisputeResolution, ResolveDisputeDto } from './dto/resolve-dispute.dto'
import { Category, EventType, ReportStatus, UserType } from '@votz/shared-types'

@Injectable()
export class ReportsService {
  constructor(
    private readonly repository: ReportsRepository,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationsService,
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
      content: 'Report registered on the Votz platform.',
      authorId: dto.anonymous ? null : user.id,
    })

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

    const allowedTypes = [UserType.ENTITY, UserType.MODERATOR, UserType.ADMIN]
    if (!allowedTypes.includes(user.type as UserType)) {
      throw new ForbiddenException('Not authorized to update report status')
    }

    const updated = await this.repository.updateStatus(reportId, dto.status as unknown as ReportStatus)

    await this.timeline.record({
      reportId,
      type: EventType.STATUS_CHANGED,
      content: dto.content,
      authorId: user.id,
      metadata: { previousStatus: report.status, newStatus: dto.status },
    })

    if (report.author?.id && report.author.id !== user.id) {
      this.notifications.notify({
        userId: report.author.id,
        type: 'STATUS_CHANGED',
        reportId,
        metadata: { previousStatus: report.status, newStatus: dto.status },
      }).catch(() => null)
    }

    return updated
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
