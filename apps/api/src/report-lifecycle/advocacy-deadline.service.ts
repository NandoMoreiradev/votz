import { Injectable, Logger } from '@nestjs/common'
import { NotificationType, OrgType } from '@prisma/client'
import { ACTIVE_REPORT_STATUSES, ReportStatus } from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { ReportLifecycleEffects } from './report-lifecycle.effects'

/** Avisa a equipe e o autor quando o prazo prometido na avocação passa sem solução. */
@Injectable()
export class AdvocacyDeadlineService {
  private readonly logger = new Logger(AdvocacyDeadlineService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly effects: ReportLifecycleEffects,
  ) {}

  async sweep(now = new Date()): Promise<number> {
    const due = await this.prisma.reportAdvocacy.findMany({
      where: {
        closedAt: null,
        deadlineNotifiedAt: null,
        promisedFor: { lt: now },
        report: { status: { in: [...ACTIVE_REPORT_STATUSES, ReportStatus.DISPUTED] }, moderationStatus: { not: 'HIDDEN' } },
      },
      take: 500,
      select: {
        id: true,
        orgType: true,
        orgId: true,
        promisedFor: true,
        report: { select: { id: true, title: true, authorId: true } },
      },
    })
    for (const a of due) {
      const claimed = await this.prisma.reportAdvocacy.updateMany({
        where: { id: a.id, deadlineNotifiedAt: null },
        data: { deadlineNotifiedAt: now },
      })
      if (claimed.count === 0) continue
      const team = await this.effects.orgMemberIds(a.orgType as unknown as OrgType, [a.orgId])
      const userIds = [...team, ...(a.report.authorId ? [a.report.authorId] : [])]
      if (userIds.length === 0) continue
      await this.notifications
        .notifyMany({
          userIds,
          type: NotificationType.ADVOCACY_DEADLINE_PASSED,
          reportId: a.report.id,
          metadata: { reportTitle: a.report.title, promisedFor: a.promisedFor?.toISOString() },
        })
        .catch((err: unknown) => this.logger.warn(`Aviso de prazo vencido falhou (${a.id}): ${String(err)}`))
    }
    return due.length
  }
}
