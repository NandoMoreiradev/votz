import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { ReportStatus } from '@votz/shared-types'

const ACTIVE_STATUSES = [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW, ReportStatus.IN_PROGRESS]

// Seção 8.3: pressao = (votos * 1.5) + (comentarios * 1) + (diasSemResposta * 2) + (relatosSimilares * 3)
@Injectable()
export class PressureScoreJob {
  private readonly logger = new Logger(PressureScoreJob.name)

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async recalculate() {
    this.logger.log('Recalculating pressure scores…')

    const reports = await this.prisma.report.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: {
        id: true,
        createdAt: true,
        groupId: true,
        _count: { select: { votes: true, comments: true } },
        timeline: {
          where: { type: 'RESPONDED' },
          select: { id: true },
          take: 1,
        },
      },
    })

    const groupCounts = reports.reduce<Record<string, number>>((acc, r) => {
      if (r.groupId) acc[r.groupId] = (acc[r.groupId] ?? 0) + 1
      return acc
    }, {})

    const now = Date.now()

    const updates = reports.map((r) => {
      const diasSemResposta =
        r.timeline.length > 0
          ? 0
          : Math.floor((now - r.createdAt.getTime()) / 86_400_000)

      const relatosSimilares = r.groupId
        ? Math.max((groupCounts[r.groupId] ?? 1) - 1, 0)
        : 0

      const score =
        r._count.votes * 1.5 +
        r._count.comments * 1 +
        diasSemResposta * 2 +
        relatosSimilares * 3

      return this.prisma.report.update({
        where: { id: r.id },
        data: { pressureScore: Math.round(score * 10) / 10 },
      })
    })

    await this.prisma.$transaction(updates)
    this.logger.log(`Updated ${updates.length} reports.`)
  }
}
