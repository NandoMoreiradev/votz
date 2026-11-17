import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { OrgType, PostCommentMediaType, PostKind } from '@prisma/client'
import { UserType } from '@votz/shared-types'
import * as DOMPurify from 'isomorphic-dompurify'
import { ActingUser, resolveOptionalActingOrg } from '../auth/acting-org'
import { cleanupR2Keys, deliverModerationNotice } from '../common/moderation.helper'
import { GifsService } from '../gifs/gifs.service'
import { MailService } from '../mail/mail.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService, isPostCommentMediaKey } from '../storage/storage.service'
import { TopicsService, normalizeTopicSlug } from '../topics/topics.service'
import { CreatePostCommentDto } from './dto/create-post-comment.dto'
import { CreatePostDto } from './dto/create-post.dto'
import { ListPostsQueryDto } from './dto/list-posts-query.dto'
import {
  FeedRankingService,
  computePostScores,
  rerankCandidatesForViewer,
} from './feed-ranking.service'
import { PostsRepository, ViewerIdentity } from './posts.repository'

function toCityKey(city?: string | null): string | null {
  if (!city) return null
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name)

  constructor(
    private readonly repo: PostsRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly gifs: GifsService,
    private readonly topics: TopicsService,
    private readonly ranking: FeedRankingService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    @Optional() private readonly unused?: unknown,
  ) {}

  async create(dto: CreatePostDto, user: ActingUser & { emailVerified?: boolean }) {
    const cleanContent = DOMPurify.sanitize(dto.content ?? '').trim()
    const media = dto.media ?? []

    if (
      cleanContent.length === 0 &&
      media.length === 0 &&
      !dto.poll &&
      !dto.mentionedReportId &&
      !dto.mentionedDebateId &&
      !dto.mentionedPropostaId &&
      !dto.mentionedDebatePollId &&
      !dto.quotePostId
    ) {
      throw new BadRequestException('A publicação precisa de texto, mídia, enquete ou menção.')
    }

    this.storage.assertOwnStorageUrls(media, 'posts')
    const mediaKeys = media
      .map((url) => this.storage.extractKeyFromUrl(url))
      .filter((k): k is string => !!k)

    const actingOrg = await resolveOptionalActingOrg(this.prisma, user, [
      'POLITICIAN',
      'ENTITY',
      'COMPANY',
    ])

    await this.validateMentions(dto)

    let city = dto.city?.trim() || null
    let state = dto.state?.trim().toUpperCase() || null
    if (!city && !state) {
      const userLoc = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { city: true, state: true },
      })
      city = userLoc?.city ?? null
      state = userLoc?.state ?? null
    }

    const kind: PostKind = dto.poll
      ? PostKind.POLL
      : dto.quotePostId
        ? PostKind.QUOTE
        : PostKind.STANDARD

    const { hotScore } = computePostScores({
      kind,
      likesCount: 0,
      commentsCount: 0,
      uniqueCommenters: 0,
      repostsCount: 0,
      pollVotesCount: 0,
      hasMedia: media.length > 0,
      hasReportMention: !!dto.mentionedReportId,
      hasDebateMention: !!dto.mentionedDebateId,
      hasPropostaMention: !!dto.mentionedPropostaId,
      authorVerified: !!actingOrg,
      authorEmailVerified: user.emailVerified ?? true,
      openFlagsCount: 0,
      createdAt: new Date(),
    })

    const pollExpiresAt = dto.poll
      ? new Date(Date.now() + (dto.poll.durationHours ?? 24) * 3_600_000)
      : undefined

    const created = await this.repo.createPost({
      content: cleanContent,
      kind,
      media,
      mediaKeys,
      authorUserId: user.id,
      authorOrgType: actingOrg ? (actingOrg.orgType as OrgType) : null,
      authorOrgId: actingOrg?.orgId ?? null,
      city,
      cityKey: toCityKey(city),
      state,
      mentionedReportId: dto.mentionedReportId,
      mentionedDebateId: dto.mentionedDebateId,
      mentionedPropostaId: dto.mentionedPropostaId,
      mentionedDebatePollId: dto.mentionedDebatePollId,
      quotePostId: dto.quotePostId,
      hotScore,
      poll: dto.poll
        ? {
            question: dto.poll.question ? DOMPurify.sanitize(dto.poll.question).trim() : null,
            expiresAt: pollExpiresAt!,
            options: dto.poll.options.map((opt) => DOMPurify.sanitize(opt).trim()),
          }
        : undefined,
    })

    if (cleanContent) {
      await this.topics.syncPostTopics(created.id, cleanContent).catch(() => null)
    }

    const refreshed = await this.repo.findRawById(created.id)
    const viewer = this.buildViewerIdentity(user)
    const [hydrated] = await this.repo.hydratePosts([refreshed ?? created], viewer)
    return hydrated
  }

  async createAdvocacyPost(params: {
    reportId: string
    userId: string
    orgType: 'POLITICIAN' | 'ENTITY'
    orgId: string
    content?: string
    media?: string[]
  }) {
    const report = await this.prisma.report.findUnique({
      where: { id: params.reportId },
      select: { id: true, title: true, city: true, cityKey: true, state: true },
    })
    if (!report) throw new NotFoundException('Relato não encontrado')

    const media = params.media ?? []
    this.storage.assertOwnStorageUrls(media, 'posts')
    const mediaKeys = media
      .map((url) => this.storage.extractKeyFromUrl(url))
      .filter((k): k is string => !!k)

    const defaultMsg = `Avocação oficial: assumi o acompanhamento do relato "${report.title}".`
    const cleanContent = DOMPurify.sanitize(params.content?.trim() || defaultMsg).trim()

    const { hotScore } = computePostScores({
      kind: PostKind.ADVOCACY,
      likesCount: 0,
      commentsCount: 0,
      uniqueCommenters: 0,
      repostsCount: 0,
      pollVotesCount: 0,
      hasMedia: media.length > 0,
      hasReportMention: true,
      hasDebateMention: false,
      hasPropostaMention: false,
      authorVerified: true,
      authorEmailVerified: true,
      openFlagsCount: 0,
      createdAt: new Date(),
    })

    const created = await this.repo.createPost({
      content: cleanContent,
      kind: PostKind.ADVOCACY,
      media,
      mediaKeys,
      authorUserId: params.userId,
      authorOrgType: params.orgType as OrgType,
      authorOrgId: params.orgId,
      city: report.city,
      cityKey: report.cityKey,
      state: report.state,
      mentionedReportId: report.id,
      hotScore,
    })

    if (cleanContent) {
      await this.topics.syncPostTopics(created.id, cleanContent).catch(() => null)
    }

    return created
  }

  async listFeed(query: ListPostsQueryDto, user?: ActingUser | null) {
    const sort = query.sort ?? 'for_you'
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const topicSlug = query.topic ? normalizeTopicSlug(query.topic) : undefined
    const cityKey = toCityKey(query.city) ?? undefined

    const viewerContext =
      sort === 'for_you' || sort === 'following'
        ? await this.repo.getViewerContext(user?.id)
        : undefined

    const { posts, total } = await this.repo.findFeedCandidates({
      sort,
      topicSlug,
      cityKey,
      state: query.state,
      kind: query.kind,
      authorType: query.authorType,
      authorUserId: query.authorUserId,
      authorOrgId: query.authorOrgId,
      hasPoll: query.hasPoll,
      viewerContext,
      page,
      limit,
    })

    let ordered = posts
    if (sort === 'for_you' && viewerContext) {
      const rankable = posts.map((p) => ({
        ...p,
        topicIds: p.topics.map((t) => t.topic.id),
      }))
      const reranked = rerankCandidatesForViewer(rankable, viewerContext)
      const skip = (page - 1) * limit
      ordered = reranked.slice(skip, skip + limit)
    }

    const hydrated = await this.repo.hydratePosts(ordered, this.buildViewerIdentity(user))

    return {
      data: hydrated,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    }
  }

  async getById(id: string, user?: ActingUser | null) {
    const post = await this.repo.findRawById(id)
    if (!post) throw new NotFoundException('Publicação não encontrada')
    const [hydrated] = await this.repo.hydratePosts([post], this.buildViewerIdentity(user))
    return hydrated
  }

  async toggleLike(postId: string, user: { id: string }) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorUserId: true },
    })
    if (!post) throw new NotFoundException('Publicação não encontrada')

    const res = await this.repo.toggleLike(postId, user.id)
    if (res.liked && post.authorUserId !== user.id) {
      this.notifications
        .notify({
          userId: post.authorUserId,
          type: 'POST_LIKE',
          metadata: { postId, actorId: user.id },
        })
        .catch(() => null)
    }

    this.ranking.enqueuePost(postId).catch(() => null)
    return res
  }

  async toggleRepost(postId: string, user: { id: string }) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorUserId: true },
    })
    if (!post) throw new NotFoundException('Publicação não encontrada')

    const res = await this.repo.toggleRepost(postId, user.id)
    if (res.reposted && post.authorUserId !== user.id) {
      this.notifications
        .notify({
          userId: post.authorUserId,
          type: 'POST_REPOST',
          metadata: { postId, actorId: user.id },
        })
        .catch(() => null)
    }

    this.ranking.enqueuePost(postId).catch(() => null)
    return res
  }

  async votePoll(postId: string, optionId: string, userId: string) {
    const poll = await this.prisma.postPoll.findUnique({
      where: { postId },
      include: { options: true },
    })
    if (!poll) throw new NotFoundException('Enquete não encontrada nesta publicação')
    if (poll.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Esta enquete já foi encerrada')
    }

    const optionExists = poll.options.some((o) => o.id === optionId)
    if (!optionExists) throw new BadRequestException('Opção inválida para esta enquete')

    const existing = await this.prisma.postPollVote.findUnique({
      where: { pollId_userId: { pollId: poll.id, userId } },
    })
    if (existing) throw new ConflictException('Você já votou nesta enquete')

    try {
      const updated = await this.repo.votePoll(poll.id, optionId, userId)
      this.ranking.enqueuePost(postId).catch(() => null)
      return {
        id: updated.id,
        question: updated.question,
        expiresAt: updated.expiresAt.toISOString(),
        expired: updated.expiresAt.getTime() <= Date.now(),
        totalVotes: updated.totalVotes,
        myVoteOptionId: optionId,
        options: updated.options.map((o) => ({
          id: o.id,
          text: o.text,
          position: o.position,
          votesCount: o.votesCount,
        })),
      }
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Você já votou nesta enquete')
      }
      throw err
    }
  }

  async listComments(postId: string) {
    const exists = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    })
    if (!exists) throw new NotFoundException('Publicação não encontrada')
    return this.repo.findCommentsByPost(postId)
  }

  async createComment(postId: string, user: ActingUser, dto: CreatePostCommentDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorUserId: true, authorOrgType: true, authorOrgId: true },
    })
    if (!post) throw new NotFoundException('Publicação não encontrada')

    if (dto.parentId) {
      const parent = await this.prisma.postComment.findUnique({
        where: { id: dto.parentId },
        select: { id: true, postId: true },
      })
      if (!parent || parent.postId !== postId) {
        throw new BadRequestException('Comentário pai inválido')
      }
    }

    const mediaType = dto.mediaType ?? PostCommentMediaType.TEXT
    const cleanContent = DOMPurify.sanitize(dto.content ?? '').trim()
    const viewer = this.buildViewerIdentity(user)

    if (mediaType === PostCommentMediaType.AUDIO) {
      const allowedAudio = this.repo.canViewerUseAudio(post, viewer)
      if (!allowedAudio) {
        throw new ForbiddenException('Apenas o autor da publicação pode comentar com áudio.')
      }
      if (!dto.mediaKey || !dto.mediaUrl) {
        throw new BadRequestException('mediaKey e mediaUrl são obrigatórios para comentário em áudio')
      }
      this.assertValidCommentUpload(dto.mediaKey, dto.mediaUrl)
    } else if (mediaType === PostCommentMediaType.IMAGE) {
      if (!dto.mediaKey || !dto.mediaUrl) {
        throw new BadRequestException('mediaKey e mediaUrl são obrigatórios para comentário com imagem')
      }
      this.assertValidCommentUpload(dto.mediaKey, dto.mediaUrl)
    } else if (mediaType === PostCommentMediaType.GIF) {
      if (!dto.mediaUrl) {
        throw new BadRequestException('mediaUrl é obrigatório para comentário com GIF')
      }
      if (dto.mediaKey) {
        this.assertValidCommentUpload(dto.mediaKey, dto.mediaUrl)
      } else if (!this.gifs.isAllowedGifUrl(dto.mediaUrl)) {
        throw new BadRequestException('URL de GIF não permitida. Use a busca integrada ou envie pelo Votz.')
      }
    } else {
      if (cleanContent.length < 1) {
        throw new BadRequestException('Comentário não pode ficar vazio')
      }
      if (dto.mediaKey || dto.mediaUrl) {
        throw new BadRequestException('Comentário de texto não aceita mídia anexada')
      }
    }

    const actingOrg = await resolveOptionalActingOrg(this.prisma, user, [
      'POLITICIAN',
      'ENTITY',
      'COMPANY',
    ])

    const comment = await this.repo.createComment({
      postId,
      authorId: user.id,
      authorOrgType: actingOrg ? (actingOrg.orgType as OrgType) : null,
      authorOrgId: actingOrg?.orgId ?? null,
      parentId: dto.parentId,
      content: cleanContent,
      mediaType,
      mediaUrl: dto.mediaUrl,
      mediaKey: dto.mediaKey,
      mediaDuration: mediaType === PostCommentMediaType.AUDIO ? dto.mediaDuration : undefined,
    })

    if (post.authorUserId !== user.id) {
      this.notifications
        .notify({
          userId: post.authorUserId,
          type: 'POST_COMMENT',
          metadata: { postId, commentId: comment.id, actorId: user.id },
        })
        .catch(() => null)
    }

    this.ranking.enqueuePost(postId).catch(() => null)
    return comment
  }

  async deletePost(id: string, requesterId: string, requesterType: string, reason?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: { id: true, authorUserId: true },
    })
    if (!post) throw new NotFoundException('Publicação não encontrada')

    const isOwner = post.authorUserId === requesterId
    const canModerate = [UserType.MODERATOR, UserType.ADMIN].includes(requesterType as UserType)
    if (!isOwner && !canModerate) throw new ForbiddenException()

    if (!isOwner && canModerate) {
      const auditReason = reason?.trim() || 'Removida pela moderação'
      const deleted = await this.repo.deletePostWithAudit(id, requesterId, auditReason)
      if (!deleted) throw new NotFoundException('Publicação não encontrada')
      cleanupR2Keys(this.storage, deleted.allMediaKeys, this.logger)
      await deliverModerationNotice(this.mail, this.prisma, this.logger, {
        actionId: deleted.actionId,
        email: deleted.author?.email,
        name: deleted.author?.name,
        kind: 'COMMENT_REMOVED',
        reason: auditReason,
      })
      return { deleted: true }
    }

    const deleted = await this.repo.deletePost(id)
    if (deleted) {
      cleanupR2Keys(this.storage, deleted.allMediaKeys, this.logger)
    }
    return { deleted: true }
  }

  async deleteComment(commentId: string, requesterId: string, requesterType: string, reason?: string) {
    const comment = await this.repo.findCommentById(commentId)
    if (!comment) throw new NotFoundException('Comentário não encontrado')

    const isOwner = comment.authorId === requesterId
    const canModerate = [UserType.MODERATOR, UserType.ADMIN].includes(requesterType as UserType)
    if (!isOwner && !canModerate) throw new ForbiddenException()

    const mediaKeys = [
      comment.mediaKey,
      ...comment.replies.map((r) => r.mediaKey),
    ]

    if (!isOwner && canModerate) {
      const auditReason = reason?.trim() || 'Removido pela moderação'
      const { actionId } = await this.repo.deleteCommentWithAudit(
        commentId,
        comment.postId,
        requesterId,
        auditReason,
      )
      cleanupR2Keys(this.storage, mediaKeys, this.logger)
      await deliverModerationNotice(this.mail, this.prisma, this.logger, {
        actionId,
        email: comment.author?.email,
        name: comment.author?.name,
        kind: 'COMMENT_REMOVED',
        reason: auditReason,
      })
      return { deleted: true }
    }

    await this.repo.deleteComment(commentId, comment.postId)
    cleanupR2Keys(this.storage, mediaKeys, this.logger)
    return { deleted: true }
  }

  private assertValidCommentUpload(mediaKey: string, mediaUrl: string) {
    if (!isPostCommentMediaKey(mediaKey)) {
      throw new BadRequestException('Chave de mídia de comentário inválida')
    }
    const expectedUrl = this.storage.getPublicUrl(mediaKey)
    if (mediaUrl !== expectedUrl) {
      throw new BadRequestException('mediaUrl não corresponde ao arquivo enviado no Votz')
    }
  }

  private buildViewerIdentity(user?: ActingUser | null): ViewerIdentity {
    return {
      userId: user?.id,
      activeOrgType: user?.ctx?.type ?? null,
      activeOrgId: user?.ctx?.id ?? null,
    }
  }

  private async validateMentions(dto: CreatePostDto) {
    if (dto.mentionedReportId) {
      const r = await this.prisma.report.findUnique({
        where: { id: dto.mentionedReportId },
        select: { id: true },
      })
      if (!r) throw new BadRequestException('Relato mencionado não encontrado')
    }
    if (dto.mentionedDebateId) {
      const d = await this.prisma.debate.findUnique({
        where: { id: dto.mentionedDebateId },
        select: { id: true },
      })
      if (!d) throw new BadRequestException('Debate mencionado não encontrado')
    }
    if (dto.mentionedPropostaId) {
      const p = await this.prisma.proposta.findUnique({
        where: { id: dto.mentionedPropostaId },
        select: { id: true },
      })
      if (!p) throw new BadRequestException('Proposta mencionada não encontrada')
    }
    if (dto.mentionedDebatePollId) {
      const dp = await this.prisma.debatePoll.findUnique({
        where: { id: dto.mentionedDebatePollId },
        select: { id: true },
      })
      if (!dp) throw new BadRequestException('Enquete de debate mencionada não encontrada')
    }
    if (dto.quotePostId) {
      const qp = await this.prisma.post.findUnique({
        where: { id: dto.quotePostId },
        select: { id: true },
      })
      if (!qp) throw new BadRequestException('Publicação citada não encontrada')
    }
  }
}
