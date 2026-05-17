import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import DOMPurify from 'isomorphic-dompurify'
import { ReportsRepository } from './reports.repository'
import { TimelineService } from '../timeline/timeline.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CreateReportDto } from './dto/create-report.dto'
import { UpdateStatusDto } from './dto/update-status.dto'
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
    const cleanTitle = dto.title.trim().replace(/\s+/g, ' ')

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
}
