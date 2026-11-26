import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { FlagStatus, FlagTargetType } from '@prisma/client'
import * as DOMPurify from 'isomorphic-dompurify'
import { AdminService } from '../admin/admin.service'
import { CommentsService } from '../comments/comments.service'
import { PostsService } from '../posts/posts.service'
import { ContextNotesService } from '../context-notes/context-notes.service'
import { CreateFlagDto } from './dto/create-flag.dto'
import { ResolveFlagDto } from './dto/resolve-flag.dto'
import { ModerationRepository } from './moderation.repository'

@Injectable()
export class ModerationService {
  constructor(
    private readonly repo: ModerationRepository,
    private readonly adminService: AdminService,
    private readonly commentsService: CommentsService,
    @Optional() private readonly postsService?: PostsService,
    @Optional() private readonly contextNotes?: ContextNotesService,
  ) {}

  async createFlag(reporter: { id: string; emailVerified: boolean }, dto: CreateFlagDto) {
    if (!reporter.emailVerified) {
      throw new ForbiddenException('Confirme seu e-mail para sinalizar conteúdos.')
    }

    if (dto.targetType === FlagTargetType.REPORT) {
      const report = await this.repo.findReportTarget(dto.targetId)
      if (!report) {
        throw new NotFoundException('Relato não encontrado.')
      }
      if (!report.anonymous && report.authorId && report.authorId === reporter.id) {
        throw new ForbiddenException('Você não pode sinalizar seu próprio relato.')
      }
    } else if (dto.targetType === FlagTargetType.COMMENT) {
      const comment = await this.repo.findCommentTarget(dto.targetId)
      if (!comment) {
        throw new NotFoundException('Comentário não encontrado.')
      }
      if (comment.authorId === reporter.id) {
        throw new ForbiddenException('Você não pode sinalizar seu próprio comentário.')
      }
    } else if (dto.targetType === FlagTargetType.POST) {
      const post = await this.repo.findPostTarget(dto.targetId)
      if (!post) {
        throw new NotFoundException('Publicação não encontrada.')
      }
      if (post.authorUserId === reporter.id) {
        throw new ForbiddenException('Você não pode sinalizar sua própria publicação.')
      }
    } else if (dto.targetType === FlagTargetType.CONTEXT_NOTE) {
      // Denunciar ou discordar de uma nota do Contexto da Comunidade. Só não vale para a própria nota.
      const note = await this.repo.findContextNoteTarget(dto.targetId)
      if (!note || note.status === 'REMOVED') {
        throw new NotFoundException('Nota não encontrada.')
      }
      if (note.authorId === reporter.id) {
        throw new ForbiddenException('Você não pode sinalizar a sua própria nota.')
      }
    } else {
      const postComment = await this.repo.findPostCommentTarget(dto.targetId)
      if (!postComment) {
        throw new NotFoundException('Comentário não encontrado.')
      }
      if (postComment.authorId === reporter.id) {
        throw new ForbiddenException('Você não pode sinalizar seu próprio comentário.')
      }
    }

    const existing = await this.repo.findDuplicate(reporter.id, dto.targetType, dto.targetId)
    if (existing) {
      throw new ConflictException('Você já sinalizou isto.')
    }

    const cleanDetails = dto.details ? DOMPurify.sanitize(dto.details).trim() : ''
    try {
      return await this.repo.createFlag({
        reporterId: reporter.id,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        details: cleanDetails.length > 0 ? cleanDetails : null,
      })
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Você já sinalizou isto.')
      }
      throw err
    }
  }

  listFlags(status: FlagStatus = FlagStatus.OPEN, page = 1, limit = 20) {
    return this.repo.listFlags({ status, page, limit: Math.min(limit, 50) })
  }

  async resolveFlag(id: string, actor: { id: string; type: string }, dto: ResolveFlagDto) {
    const flag = await this.repo.findFlagById(id)
    if (!flag) {
      throw new NotFoundException('Sinalização não encontrada.')
    }
    if (flag.status !== FlagStatus.OPEN) {
      throw new BadRequestException('Esta sinalização já foi analisada.')
    }

    const note = DOMPurify.sanitize(dto.note).trim()
    if (note.length < 10) {
      throw new BadRequestException('A observação deve ter entre 10 e 500 caracteres.')
    }

    if (dto.action === 'DISMISS') {
      const dismissed = await this.repo.resolveDismiss(id, actor.id, note)
      if (flag.targetType === FlagTargetType.REPORT) {
        await this.repo.restoreReportModerationStatus?.(flag.targetId)
      }
      return dismissed
    }

    if (flag.targetType === FlagTargetType.REPORT) {
      await this.adminService.deleteReport(flag.targetId, actor.id, note)
    } else if (flag.targetType === FlagTargetType.COMMENT) {
      await this.commentsService.delete(flag.targetId, actor.id, actor.type, note)
    } else if (flag.targetType === FlagTargetType.POST) {
      await this.postsService?.deletePost(flag.targetId, actor.id, actor.type, note)
    } else if (flag.targetType === FlagTargetType.CONTEXT_NOTE) {
      await this.contextNotes?.removeByModeration(flag.targetId, actor.id, note)
    } else {
      await this.postsService?.deleteComment(flag.targetId, actor.id, actor.type, note)
    }

    return this.repo.markTargetFlagsActioned(flag.targetType, flag.targetId, actor.id, note)
  }
}
