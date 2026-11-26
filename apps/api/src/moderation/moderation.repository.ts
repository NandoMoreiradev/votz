import { Injectable } from '@nestjs/common'
import { FlagReason, FlagStatus, FlagTargetType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface FlagTargetPreview {
  title: string | null
  excerpt: string
  link: string | null
  exists: boolean
  moderationStatus?: string
}

@Injectable()
export class ModerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findReportTarget(id: string) {
    return this.prisma.report.findUnique({
      where: { id },
      select: { id: true, authorId: true, anonymous: true },
    })
  }

  findCommentTarget(id: string) {
    return this.prisma.comment.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    })
  }

  findPostTarget(id: string) {
    return this.prisma.post.findUnique({
      where: { id },
      select: { id: true, authorUserId: true },
    })
  }

  findContextNoteTarget(id: string) {
    return this.prisma.contextNote.findUnique({
      where: { id },
      select: { id: true, authorId: true, status: true },
    })
  }

  findPostCommentTarget(id: string) {
    return this.prisma.postComment.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    })
  }

  findDuplicate(reporterId: string, targetType: FlagTargetType, targetId: string) {
    return this.prisma.contentFlag.findUnique({
      where: {
        reporterId_targetType_targetId: { reporterId, targetType, targetId },
      },
      select: { id: true },
    })
  }

  createFlag(data: {
    reporterId: string
    targetType: FlagTargetType
    targetId: string
    reason: FlagReason
    details: string | null
  }) {
    return this.prisma.contentFlag.create({
      data,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    })
  }

  async listFlags(params: { status: FlagStatus; page: number; limit: number }) {
    const where = { status: params.status }
    const skip = (params.page - 1) * params.limit

    const [flags, total, openCount] = await Promise.all([
      this.prisma.contentFlag.findMany({
        where,
        select: {
          id: true,
          targetType: true,
          targetId: true,
          reason: true,
          details: true,
          status: true,
          source: true,
          resolvedById: true,
          resolvedAt: true,
          resolutionNote: true,
          createdAt: true,
          reporter: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.contentFlag.count({ where }),
      this.prisma.contentFlag.count({ where: { status: FlagStatus.OPEN } }),
    ])

    const reportIds = flags.filter((f) => f.targetType === FlagTargetType.REPORT).map((f) => f.targetId)
    const commentIds = flags.filter((f) => f.targetType === FlagTargetType.COMMENT).map((f) => f.targetId)
    const postIds = flags.filter((f) => f.targetType === FlagTargetType.POST).map((f) => f.targetId)
    const postCommentIds = flags.filter((f) => f.targetType === FlagTargetType.POST_COMMENT).map((f) => f.targetId)

    const noteIds = flags.filter((f) => f.targetType === FlagTargetType.CONTEXT_NOTE).map((f) => f.targetId)

    const [reports, comments, posts, postComments, contextNotes] = await Promise.all([
      reportIds.length > 0
        ? this.prisma.report.findMany({
            where: { id: { in: reportIds } },
            select: { id: true, title: true, description: true, moderationStatus: true },
          })
        : Promise.resolve([]),
      commentIds.length > 0
        ? this.prisma.comment.findMany({
            where: { id: { in: commentIds } },
            select: {
              id: true,
              content: true,
              reportId: true,
              report: { select: { title: true } },
            },
          })
        : Promise.resolve([]),
      postIds.length > 0
        ? this.prisma.post.findMany({
            where: { id: { in: postIds } },
            select: { id: true, content: true },
          })
        : Promise.resolve([]),
      postCommentIds.length > 0
        ? this.prisma.postComment.findMany({
            where: { id: { in: postCommentIds } },
            select: { id: true, content: true, postId: true },
          })
        : Promise.resolve([]),
      noteIds.length > 0
        ? this.prisma.contextNote.findMany({
            where: { id: { in: noteIds } },
            select: { id: true, text: true, status: true, postId: true, reportId: true },
          })
        : Promise.resolve([]),
    ])

    const reportMap = new Map(reports.map((r) => [r.id, r]))
    const commentMap = new Map(comments.map((c) => [c.id, c]))
    const postMap = new Map(posts.map((p) => [p.id, p]))
    const postCommentMap = new Map(postComments.map((c) => [c.id, c]))
    const noteMap = new Map(contextNotes.map((n) => [n.id, n]))

    const data = flags.map((flag) => {
      let targetPreview: FlagTargetPreview
      if (flag.targetType === FlagTargetType.REPORT) {
        const rep = reportMap.get(flag.targetId)
        targetPreview = rep
          ? {
              title: rep.title,
              excerpt: rep.description.slice(0, 200),
              link: `/relatos/${rep.id}`,
              exists: true,
              moderationStatus: rep.moderationStatus,
            }
          : {
              title: null,
              excerpt: '[Relato já removido]',
              link: null,
              exists: false,
            }
      } else if (flag.targetType === FlagTargetType.COMMENT) {
        const com = commentMap.get(flag.targetId)
        targetPreview = com
          ? {
              title: com.report?.title ?? null,
              excerpt: com.content.slice(0, 200),
              link: `/relatos/${com.reportId}`,
              exists: true,
            }
          : {
              title: null,
              excerpt: '[Comentário já removido]',
              link: null,
              exists: false,
            }
      } else if (flag.targetType === FlagTargetType.POST) {
        const post = postMap.get(flag.targetId)
        targetPreview = post
          ? {
              title: 'Publicação no Feed',
              excerpt: post.content.slice(0, 200),
              link: `/publicacoes/${post.id}`,
              exists: true,
            }
          : {
              title: null,
              excerpt: '[Publicação já removida]',
              link: null,
              exists: false,
            }
      } else if (flag.targetType === FlagTargetType.CONTEXT_NOTE) {
        const note = noteMap.get(flag.targetId)
        targetPreview =
          note && note.status !== 'REMOVED'
            ? {
                title: 'Nota do Contexto da Comunidade',
                excerpt: note.text.slice(0, 200),
                link: note.postId ? `/publicacoes/${note.postId}` : `/relatos/${note.reportId}`,
                exists: true,
              }
            : {
                title: null,
                excerpt: '[Nota já removida]',
                link: null,
                exists: false,
              }
      } else {
        const com = postCommentMap.get(flag.targetId)
        targetPreview = com
          ? {
              title: 'Comentário em publicação',
              excerpt: com.content.slice(0, 200),
              link: `/publicacoes/${com.postId}`,
              exists: true,
            }
          : {
              title: null,
              excerpt: '[Comentário já removido]',
              link: null,
              exists: false,
            }
      }
      return { ...flag, targetPreview }
    })

    return {
      data,
      meta: {
        total,
        openCount,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    }
  }

  findFlagById(id: string) {
    return this.prisma.contentFlag.findUnique({
      where: { id },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        status: true,
      },
    })
  }

  resolveDismiss(id: string, resolvedById: string, resolutionNote: string) {
    return this.prisma.contentFlag.update({
      where: { id },
      data: {
        status: FlagStatus.DISMISSED,
        resolvedById,
        resolvedAt: new Date(),
        resolutionNote,
      },
      select: {
        id: true,
        status: true,
        resolvedAt: true,
        resolutionNote: true,
      },
    })
  }

  restoreReportModerationStatus(reportId: string) {
    return this.prisma.report.updateMany({
      where: { id: reportId, moderationStatus: { not: 'PUBLISHED' } },
      data: { moderationStatus: 'PUBLISHED' },
    })
  }

  async markTargetFlagsActioned(
    targetType: FlagTargetType,
    targetId: string,
    resolvedById: string,
    resolutionNote: string,
  ) {
    const result = await this.prisma.contentFlag.updateMany({
      where: {
        targetType,
        targetId,
        status: FlagStatus.OPEN,
      },
      data: {
        status: FlagStatus.ACTIONED,
        resolvedById,
        resolvedAt: new Date(),
        resolutionNote,
      },
    })

    return {
      status: FlagStatus.ACTIONED,
      updatedCount: result.count,
    }
  }
}
