import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { OrgType, WebhookEventType } from '@prisma/client'
import { Queue } from 'bullmq'
import { AlertsRepository } from './alerts.repository'
import { NotificationsService } from '../notifications/notifications.service'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import { PressRadarService } from '../imprensa/press-radar.service'

export const ALERTS_QUEUE = 'alerts'

const SURGE_THRESHOLD = 5
const SURGE_WINDOW_HOURS = 24

export interface AlertsJob {
  category: string
  city: string
  state: string
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name)

  constructor(
    private readonly repo: AlertsRepository,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    @InjectQueue(ALERTS_QUEUE) private readonly queue: Queue,
    @Optional() private readonly webhooks?: WebhooksService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly pressRadar?: PressRadarService,
  ) {}

  // ── Enqueue helpers ────────────────────────────────────────────────────────

  async enqueueCheck(category: string, city: string, state: string): Promise<void> {
    if (!city) return
    await this.queue.add(
      'check-surto',
      { category, city, state } satisfies AlertsJob,
      {
        jobId: `surto-${category}-${city.toLowerCase()}`,
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    )
  }

  async enqueueBatchCheck(): Promise<void> {
    await this.queue.add(
      'check-all-surtos',
      {},
      {
        jobId: 'batch-surtos',
        removeOnComplete: 5,
        removeOnFail: 5,
        attempts: 2,
        backoff: { type: 'fixed', delay: 10_000 },
      },
    )
  }

  // ── Core logic ─────────────────────────────────────────────────────────────

  async checkSurto(category: string, city: string, state: string): Promise<void> {
    const since = this.windowStart()
    const count = await this.repo.countRecentReports(category, city, since)
    const active = count >= SURGE_THRESHOLD

    const { surto, justActivated } = await this.repo.upsertSurto({ category, city, state, count, active })

    if (active) {
      const linked = await this.repo.linkReportsToSurto(surto.id, category, city, since)
      this.logger.warn(
        `[surto] ${category} em ${city} — ${count} relatos em ${SURGE_WINDOW_HOURS}h (${linked} vinculados)`,
      )

      // Notifica a entidade mais citada e jornalistas PRESS apenas na primeira ativação
      if (justActivated) {
        const entityUserId = await this.repo.findTopEntityUserForSurto(category, city, since)
        if (entityUserId) {
          this.notifications.notify({
            userId: entityUserId,
            type: 'SURTO_DETECTED',
            reportId: surto.id,
            metadata: { category, city, state, count },
          }).catch(() => null)
        }

        // Radar de imprensa: quem criou avisos de surto recebe pelas regras dele (cidade, tema, frequência)
        this.pressRadar
          ?.onSurtoActivated({ id: surto.id, category, city, state, count })
          .catch((err) => this.logger.error(`Falha no radar de imprensa (surto ${surto.id})`, err))

        // E-mail padrão para os jornalistas PRESS verificados que não têm aviso de surto próprio (fire-and-forget)
        this.repo.findVerifiedPressUsers().then((pressUsers) => {
          for (const u of pressUsers) {
            this.mail.sendSurtoAlert(u.email, u.name, { category, city, state, count, surtoId: surto.id })
              .catch(() => null)
          }
        }).catch(() => null)

        // Webhooks OUTBREAK_DETECTED para organizações com endpoint ativo na UF
        if (this.webhooks && this.prisma) {
          this.prisma.webhookEndpoint
            .findMany({
              where: { active: true, events: { has: WebhookEventType.OUTBREAK_DETECTED } },
              select: { orgType: true, orgId: true },
              distinct: ['orgType', 'orgId'],
            })
            .then(async (orgs) => {
              for (const org of orgs) {
                const inScope =
                  org.orgType === OrgType.POLITICIAN
                    ? await this.prisma!.politician.findFirst({
                        where: { id: org.orgId, state: state.toUpperCase() },
                        select: { id: true },
                      })
                    : await this.prisma!.entity.findFirst({
                        where: { id: org.orgId, state: state.toUpperCase() },
                        select: { id: true },
                      })
                if (!inScope) continue
                await this.webhooks!.enqueueEvent(
                  org.orgType,
                  org.orgId,
                  WebhookEventType.OUTBREAK_DETECTED,
                  `surto:${surto.id}`,
                  { surtoId: surto.id, category, city, state, reportCount: count },
                )
              }
            })
            .catch(() => null)
        }
      }
    }
  }

  async checkAllActiveSurtos(): Promise<void> {
    const since = this.windowStart()
    await this.repo.reassessAll(since, SURGE_THRESHOLD)
    this.logger.log('Batch surto reassessment complete')
  }

  // ── Public queries ─────────────────────────────────────────────────────────

  findActive() {
    return this.repo.findActive()
  }

  findOne(id: string) {
    return this.repo.findOneWithReports(id)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private windowStart(): Date {
    return new Date(Date.now() - SURGE_WINDOW_HOURS * 60 * 60 * 1000)
  }
}
