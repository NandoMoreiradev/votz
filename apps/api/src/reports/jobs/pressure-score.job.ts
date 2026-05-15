import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class PressureScoreJob {
  private readonly logger = new Logger(PressureScoreJob.name)

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async recalculate() {
    this.logger.log('Recalculating pressure scores...')

    const reports = await this.prisma.report.findMany({
      where: { status: { notIn: ['RESOLVED', 'ARCHIVED'] } },
      select: {
        id: true,
        createdAt: true,
        _count: { select: { votes: true, comments: true } },
      },
    })

    const now = Date.now()

    const updates = reports.map((report) => {
      const daysWithoutResponse = Math.floor((now - report.createdAt.getTime()) / 86_400_000)
      const pressureScore =
        report._count.votes * 1.5 +
        report._count.comments * 1 +
        daysWithoutResponse * 2

      return this.prisma.report.update({
        where: { id: report.id },
        data: { pressureScore },
      })
    })

    await this.prisma.$transaction(updates)
    this.logger.log(`Updated pressure scores for ${reports.length} reports`)
  }
}
