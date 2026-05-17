import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import * as DOMPurify from 'isomorphic-dompurify'
import { PrismaService } from '../prisma/prisma.service'
import { CommentsRepository } from './comments.repository'
import { NotificationsService } from '../notifications/notifications.service'
import { PressureService } from '../press/pressure.service'
import { CreateCommentDto } from './dto/create-comment.dto'
import { UserType } from '@votz/shared-types'

@Injectable()
export class CommentsService {
  constructor(
    private readonly repo: CommentsRepository,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly pressure: PressureService,
  ) {}

  async create(reportId: string, authorId: string, dto: CreateCommentDto) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, authorId: true, title: true },
    })
    if (!report) throw new NotFoundException('Report not found')

    const content = DOMPurify.sanitize(dto.content)
    const comment = await this.repo.create({ reportId, authorId, content, parentId: dto.parentId })

    if (report.authorId && report.authorId !== authorId) {
      this.notifications.notify({
        userId: report.authorId,
        type: 'NEW_COMMENT',
        reportId,
        metadata: { commentId: comment.id, actorId: authorId },
      }).catch(() => null)
    }

    // Enfileira recálculo imediato — fire-and-forget
    this.pressure.enqueueReport(reportId).catch(() => null)

    return comment
  }

  findByReport(reportId: string) {
    return this.repo.findByReport(reportId)
  }

  async delete(id: string, requesterId: string, requesterType: string) {
    const comment = await this.repo.findById(id)
    if (!comment) throw new NotFoundException('Comment not found')

    const isOwner = comment.authorId === requesterId
    const canModerate = [UserType.MODERATOR, UserType.ADMIN].includes(requesterType as UserType)

    if (!isOwner && !canModerate) throw new ForbiddenException()

    return this.repo.delete(id)
  }
}
