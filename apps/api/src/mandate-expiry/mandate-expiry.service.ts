import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { ConfigService } from '@nestjs/config'
import Stripe from 'stripe'
import { PrismaService } from '../prisma/prisma.service'
import { EventType } from '@votz/shared-types'
import { PoliticianStatus, ReportStatus as PrismaReportStatus } from '@prisma/client'

export const MANDATE_EXPIRY_QUEUE = 'mandate-expiry'

const OPEN_STATUSES: PrismaReportStatus[] = [
  PrismaReportStatus.OPEN,
  PrismaReportStatus.UNDER_REVIEW,
  PrismaReportStatus.IN_PROGRESS,
]

@Injectable()
export class MandateExpiryService {
  private readonly logger = new Logger(MandateExpiryService.name)
  private stripe: InstanceType<typeof Stripe>

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(MANDATE_EXPIRY_QUEUE) private readonly queue: Queue,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'))
  }

  async enqueue(): Promise<void> {
    await this.queue.add(
      'process-expired',
      {},
      { jobId: 'mandate-expiry:daily', removeOnComplete: 10, removeOnFail: 10 },
    )
  }

  async processExpiredMandates(): Promise<{ processed: number }> {
    const now = new Date()
    const expired = await this.prisma.politician.findMany({
      where: { status: PoliticianStatus.ATIVO, termEnd: { lt: now } },
      select: { id: true, name: true, plan: true, stripeSubscriptionId: true },
    })

    this.logger.log(`Found ${expired.length} expired mandates to process`)

    for (const politician of expired) {
      await this.processPolitician(politician, now)
    }

    return { processed: expired.length }
  }

  async reactivateElectedPoliticians(): Promise<{ reactivated: number }> {
    const now = new Date()
    const reactivated = await this.prisma.politician.updateMany({
      where: { status: PoliticianStatus.ENCERRADO, termEnd: { gt: now } },
      data: { status: PoliticianStatus.ATIVO },
    })

    if (reactivated.count > 0) {
      this.logger.log(`Reactivated ${reactivated.count} re-elected politicians`)
    }

    return { reactivated: reactivated.count }
  }

  private async processPolitician(
    politician: { id: string; name: string; plan: string; stripeSubscriptionId: string | null },
    now: Date,
  ): Promise<void> {
    try {
      const openReports = await this.prisma.report.findMany({
        where: {
          recipientType: 'POLITICIAN',
          recipientId: politician.id,
          status: { in: OPEN_STATUSES },
        },
        select: {
          id: true,
          status: true,
          timeline: {
            where: { type: 'RESPONDED' as const },
            select: { metadata: true },
          },
        },
      })

      // Atomic: timeline events + status reversions + politician ENCERRADO
      await this.prisma.$transaction(async (tx) => {
        for (const report of openReports) {
          const wasAdvocated = report.timeline.some(
            (e) =>
              (e.metadata as Record<string, unknown>)?.action === 'advocated' &&
              (e.metadata as Record<string, unknown>)?.politicianId === politician.id,
          )

          await tx.timelineEvent.create({
            data: {
              reportId: report.id,
              type: EventType.UPDATE,
              content: wasAdvocated
                ? 'Mandato encerrado com compromisso assumido e não cumprido. Relato reaberto para reatribuição.'
                : 'Mandato do destinatário encerrado. Relato reaberto para reatribuição.',
              metadata: {
                reason: 'MANDATO_ENCERRADO',
                action: wasAdvocated ? 'mandate_ended_unresolved_commitment' : 'mandate_ended',
                politicianId: politician.id,
                at: now.toISOString(),
              },
            },
          })

          if (report.status === PrismaReportStatus.IN_PROGRESS) {
            await tx.report.update({
              where: { id: report.id },
              data: { status: PrismaReportStatus.OPEN },
            })
          }
        }

        await tx.politician.update({
          where: { id: politician.id },
          data: { status: PoliticianStatus.ENCERRADO },
        })
      })

      // Runs after transaction so GROUP BY reflects final state
      await this.freezeMandatometer(politician.id)

      // External call — always outside transaction; failure is logged and non-fatal
      if (politician.plan !== 'BASICO' && politician.stripeSubscriptionId) {
        await this.cancelSubscription(politician.id, politician.stripeSubscriptionId)
      }

      this.logger.log(`Processed mandate expiry for politician ${politician.id} (${openReports.length} reports reopened)`)
    } catch (err) {
      this.logger.error(`Failed to process politician ${politician.id}: ${(err as Error).message}`)
    }
  }

  private async freezeMandatometer(politicianId: string): Promise<void> {
    const where = { recipientType: 'POLITICIAN' as const, recipientId: politicianId }
    const [byStatusRaw, byCategoryRaw] = await Promise.all([
      this.prisma.report.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.report.groupBy({ by: ['category'], where, _count: true }),
    ])

    const byStatus = byStatusRaw.reduce((acc, r) => ({ ...acc, [r.status]: r._count }), {} as Record<string, number>)
    const byCategory = byCategoryRaw
      .sort((a, b) => b._count - a._count)
      .map((r) => ({ category: r.category, count: r._count }))
    const total = byStatusRaw.reduce((s, r) => s + r._count, 0)
    const resolved = byStatus['RESOLVED'] ?? 0
    const inProgress = byStatus['IN_PROGRESS'] ?? 0
    const open = byStatus['OPEN'] ?? 0
    const disputed = byStatus['DISPUTED'] ?? 0

    await this.prisma.politician.update({
      where: { id: politicianId },
      data: {
        mandatometer: { total, resolved, inProgress, open, disputed, byStatus, byCategory, frozenAt: new Date().toISOString() },
      },
    })
  }

  private async cancelSubscription(politicianId: string, subscriptionId: string): Promise<void> {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId)
      await this.prisma.politician.update({
        where: { id: politicianId },
        data: { plan: 'BASICO', stripeSubscriptionId: null },
      })
      this.logger.log(`Cancelled Stripe subscription for politician ${politicianId}`)
    } catch (err) {
      this.logger.warn(`Failed to cancel Stripe subscription for politician ${politicianId}: ${(err as Error).message}`)
    }
  }
}
