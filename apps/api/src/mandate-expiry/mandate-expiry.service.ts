import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { DAY_MS, windowedJobId } from '../common/queue/job-window'
import { ConfigService } from '@nestjs/config'
import Stripe from 'stripe'
import { PrismaService } from '../prisma/prisma.service'
import { MandatometerService } from '../report-lifecycle/mandatometer.service'
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
    private readonly mandatometer: MandatometerService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'))
  }

  async enqueue(): Promise<void> {
    await this.queue.add(
      'process-expired',
      {},
      { jobId: windowedJobId('mandate-expiry', DAY_MS), removeOnComplete: 10, removeOnFail: 10 },
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
        select: { id: true, status: true },
      })
      // Compromissos (avocações) ainda abertos, em qualquer relato, inclusive de outros destinatários.
      const activeAdvocacies = await this.prisma.reportAdvocacy.findMany({
        where: { orgType: 'POLITICIAN', orgId: politician.id, closedAt: null },
        select: { id: true, reportId: true, report: { select: { status: true } } },
      })
      const advocatedReportIds = new Set(activeAdvocacies.map((a) => a.reportId))
      const meta = { orgType: 'POLITICIAN', orgId: politician.id, politicianId: politician.id, orgName: politician.name }

      // Atomic: timeline events + status reversions + avocações encerradas + politician ENCERRADO
      await this.prisma.$transaction(async (tx) => {
        for (const report of openReports) {
          const wasAdvocated = advocatedReportIds.has(report.id)
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
                at: now.toISOString(),
                ...meta,
              },
            },
          })

          if (report.status !== PrismaReportStatus.OPEN) {
            const moved = await tx.report.updateMany({
              where: { id: report.id, status: report.status },
              data: { status: PrismaReportStatus.OPEN },
            })
            if (moved.count > 0) {
              await tx.timelineEvent.create({
                data: {
                  reportId: report.id,
                  type: EventType.STATUS_CHANGED,
                  content: 'Relato voltou para "Aberto" porque o mandato do destinatário terminou.',
                  metadata: {
                    action: 'status_changed',
                    previousStatus: report.status,
                    newStatus: PrismaReportStatus.OPEN,
                    reason: 'MANDATO_ENCERRADO',
                    ...meta,
                  },
                },
              })
            }
          }
        }

        // Avocações em relatos de outros destinatários que o mandato deixou sem solução.
        const openRecipientIds = new Set(openReports.map((r) => r.id))
        for (const a of activeAdvocacies) {
          const unresolved = a.report.status !== PrismaReportStatus.RESOLVED
          if (unresolved && !openRecipientIds.has(a.reportId)) {
            await tx.timelineEvent.create({
              data: {
                reportId: a.reportId,
                type: EventType.UPDATE,
                content: `Mandato de ${politician.name} encerrado com o compromisso assumido neste relato ainda sem solução.`,
                metadata: { action: 'mandate_ended_unresolved_commitment', at: now.toISOString(), ...meta },
              },
            })
          }
          await tx.reportAdvocacy.update({
            where: { id: a.id },
            data: unresolved
              ? { closedAt: now, closedReason: 'MANDATE_ENDED' }
              : { closedAt: now, closedReason: null, closedNote: 'Mandato encerrado com o relato resolvido.' },
          })
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
    await this.mandatometer.freeze(politicianId)
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
