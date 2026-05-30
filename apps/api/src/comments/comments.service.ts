import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import * as DOMPurify from 'isomorphic-dompurify'
import { PrismaService } from '../prisma/prisma.service'
import { CommentsRepository } from './comments.repository'
import { NotificationsService } from '../notifications/notifications.service'
import { PressureService } from '../press/pressure.service'
import { TranscriptionService } from '../transcription/transcription.service'
import { CreateCommentDto, CommentMediaType } from './dto/create-comment.dto'
import { UpdateCommentDto } from './dto/update-comment.dto'
import { UserType } from '@votz/shared-types'

@Injectable()
export class CommentsService {
  constructor(
    private readonly repo: CommentsRepository,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly pressure: PressureService,
    private readonly transcription: TranscriptionService,
  ) {}

  async create(
    reportId: string,
    authorId: string,
    userType: string,
    dto: CreateCommentDto,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, authorId: true, title: true, recipientType: true, recipientId: true },
    })
    if (!report) throw new NotFoundException('Report not found')

    const isVoice = dto.mediaType && dto.mediaType !== CommentMediaType.TEXT

    if (isVoice) {
      if (userType !== UserType.POLITICIAN && userType !== UserType.ENTITY) {
        throw new ForbiddenException('Apenas políticos e entidades podem enviar comentários de voz')
      }
      if (!dto.mediaUrl || !dto.mediaKey) {
        throw new BadRequestException('mediaUrl e mediaKey são obrigatórios para comentários de voz')
      }

      const orgType = userType === UserType.POLITICIAN ? 'POLITICIAN' : 'ENTITY'
      const membership = await this.prisma.orgMembership.findFirst({
        where: { userId: authorId, orgType, status: 'ACTIVE' },
        select: { orgId: true },
      })
      if (!membership) throw new ForbiddenException('Perfil ativo não encontrado')

      const orgId = membership.orgId
      const recipientOrgType = orgType === 'POLITICIAN' ? 'POLITICIAN' : 'ENTITY'
      const isRecipient =
        report.recipientType === recipientOrgType && report.recipientId === orgId

      const isFollower = await this.prisma.reportFollower.findUnique({
        where: {
          reportId_actorType_actorId: {
            reportId,
            actorType: orgType as never,
            actorId: orgId,
          },
        },
      })

      if (!isRecipient && !isFollower) {
        throw new ForbiddenException(
          'Você precisa ser destinatário ou ter avocado o relato para comentar por voz',
        )
      }
    }

    const rawContent = isVoice ? (dto.content ?? '') : (dto.content ?? '')
    if (!isVoice && rawContent.trim().length < 3) {
      throw new BadRequestException('Comentário muito curto')
    }

    const content = DOMPurify.sanitize(rawContent)
    const comment = await this.repo.create({
      reportId,
      authorId,
      content,
      parentId: dto.parentId,
      mediaType: dto.mediaType,
      mediaUrl: dto.mediaUrl,
      mediaKey: dto.mediaKey,
      mediaDuration: dto.mediaDuration,
    })

    if (report.authorId && report.authorId !== authorId) {
      this.notifications.notify({
        userId: report.authorId,
        type: 'NEW_COMMENT',
        reportId,
        metadata: { commentId: comment.id, actorId: authorId },
      }).catch(() => null)
    }

    this.pressure.enqueueReport(reportId).catch(() => null)

    if (isVoice && dto.mediaKey) {
      this.transcription.enqueue({
        commentId: comment.id,
        mediaKey: dto.mediaKey,
      }).catch(() => null)
    }

    return comment
  }

  findByReport(reportId: string) {
    return this.repo.findByReport(reportId)
  }

  async update(id: string, requesterId: string, dto: UpdateCommentDto) {
    const comment = await this.repo.findById(id)
    if (!comment) throw new NotFoundException('Comment not found')
    if (comment.authorId !== requesterId) throw new ForbiddenException()

    const content = DOMPurify.sanitize(dto.content)
    return this.repo.update(id, content)
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
