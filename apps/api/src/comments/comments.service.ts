import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import * as DOMPurify from 'isomorphic-dompurify'
import { PrismaService } from '../prisma/prisma.service'
import { CommentsRepository } from './comments.repository'
import { CreateCommentDto } from './dto/create-comment.dto'
import { UserType } from '@votz/shared-types'

@Injectable()
export class CommentsService {
  constructor(
    private readonly repo: CommentsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(reportId: string, authorId: string, dto: CreateCommentDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId }, select: { id: true } })
    if (!report) throw new NotFoundException('Report not found')

    const content = DOMPurify.sanitize(dto.content)

    return this.repo.create({ reportId, authorId, content, parentId: dto.parentId })
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
