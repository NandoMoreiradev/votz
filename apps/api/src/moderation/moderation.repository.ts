import { Injectable } from '@nestjs/common'
import { FlagReason, FlagStatus, FlagTargetType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface FlagTargetPreview {
  title: string | null
  excerpt: string
  link: string | null
  exists: boolean
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

    const [reports, comments] = await Promise.all([
      reportIds.length > 0
        ? this.prisma.report.findMany({
            where: { id: { in: reportIds } },
            select: { id: true, title: true, description: true },
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
    ])

    const reportMap = new Map(reports.map((r) => [r.id, r]))
    const commentMap = new Map(comments.map((c) => [c.id, c]))

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
            }
          : {
              title: null,
              excerpt: '[Relato já removido]',
              link: null,
              exists: false,
            }
      } else {
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
