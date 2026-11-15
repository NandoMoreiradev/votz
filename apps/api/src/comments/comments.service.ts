import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common'
import * as DOMPurify from 'isomorphic-dompurify'
import { PrismaService } from '../prisma/prisma.service'
import { CommentsRepository } from './comments.repository'
import { NotificationsService } from '../notifications/notifications.service'
import { PressureService } from '../press/pressure.service'
import { TranscriptionService } from '../transcription/transcription.service'
import { StorageService, isCommentMediaKey } from '../storage/storage.service'
import { MailService } from '../mail/mail.service'
import { cleanupR2Keys, deliverModerationNotice } from '../common/moderation.helper'
import { CreateCommentDto, CommentMediaType } from './dto/create-comment.dto'
import { UpdateCommentDto } from './dto/update-comment.dto'
import { UserType } from '@votz/shared-types'

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name)

  constructor(
    private readonly repo: CommentsRepository,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly pressure: PressureService,
    private readonly transcription: TranscriptionService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
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
      this.validateCommentMedia(dto.mediaKey, dto.mediaUrl)

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
    } else if (dto.mediaKey !== undefined || dto.mediaUrl !== undefined) {
      if (!dto.mediaKey || !dto.mediaUrl) {
        throw new BadRequestException('mediaUrl e mediaKey são obrigatórios juntos')
      }
      this.validateCommentMedia(dto.mediaKey, dto.mediaUrl)
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

  async delete(id: string, requesterId: string, requesterType: string, reason?: string) {
    const comment = await this.repo.findById(id)
    if (!comment) throw new NotFoundException('Comment not found')

    const isOwner = comment.authorId === requesterId
    const canModerate = [UserType.MODERATOR, UserType.ADMIN].includes(requesterType as UserType)

    if (!isOwner && !canModerate) throw new ForbiddenException()

    if (!isOwner && canModerate) {
      const auditReason = reason?.trim() || 'Removido pela moderação'
      const { actionId } = await this.repo.deleteWithAudit(id, requesterId, auditReason)
      cleanupR2Keys(this.storage, [comment.mediaKey], this.logger)
      await deliverModerationNotice(this.mail, this.prisma, this.logger, {
        actionId,
        email: comment.author?.email,
        name: comment.author?.name,
        kind: 'COMMENT_REMOVED',
        reason: auditReason,
      })
      return { deleted: true }
    }

    const deleted = await this.repo.delete(id)
    cleanupR2Keys(this.storage, [comment.mediaKey], this.logger)
    return deleted
  }

  private validateCommentMedia(mediaKey: string, mediaUrl: string) {
    if (!isCommentMediaKey(mediaKey)) {
      throw new BadRequestException('Chave de mídia de comentário inválida')
    }
    const expectedUrl = this.storage.getPublicUrl(mediaKey)
    if (mediaUrl !== expectedUrl) {
      throw new BadRequestException('mediaUrl não corresponde ao arquivo enviado no Votz')
    }
  }
}
