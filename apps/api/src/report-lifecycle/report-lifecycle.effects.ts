import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import {
  FollowerActorType,
  MembershipStatus,
  NotificationType,
  OrgType,
  UserType,
  VoteType,
  WebhookEventType,
} from '@prisma/client'
import { ReportStatus } from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import { PressureService } from '../press/pressure.service'
import { syncReportSlaState } from './sla-sync'
import { LIFECYCLE_QUEUE, LifecycleReport, MandatometerRefreshJob } from './report-lifecycle.types'

/**
 * Tudo o que acontece DEPOIS de uma mudança no relato já gravada: avisos, webhooks, pressão, SLA e
 * Mandatômetro. Nada aqui pode desfazer a ação: cada passo é best-effort e só registra a falha no log.
 */
@Injectable()
export class ReportLifecycleEffects {
  private readonly logger = new Logger(ReportLifecycleEffects.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue(LIFECYCLE_QUEUE) private readonly queue: Queue,
    @Optional() private readonly webhooks?: WebhooksService,
    @Optional() private readonly pressure?: PressureService,
  ) {}

  // ── Públicos de cada aviso ──────────────────────────────────────────────────

  async orgMemberIds(orgType: OrgType, orgIds: string[]): Promise<string[]> {
    if (orgIds.length === 0) return []
    const rows = await this.prisma.orgMembership.findMany({
      where: { orgType, orgId: { in: orgIds }, status: MembershipStatus.ACTIVE },
      select: { userId: true },
    })
    return rows.map((r) => r.userId)
  }

  async recipientMemberIds(report: Pick<LifecycleReport, 'recipientType' | 'recipientId'>): Promise<string[]> {
    if (!report.recipientId) return []
    if (report.recipientType === 'POLITICIAN') return this.orgMemberIds(OrgType.POLITICIAN, [report.recipientId])
    if (report.recipientType === 'ENTITY') return this.orgMemberIds(OrgType.ENTITY, [report.recipientId])
    return []
  }

  /** Equipes de quem acompanha o relato (quem avocou passa a acompanhar automaticamente). */
  async followerMemberIds(reportId: string): Promise<string[]> {
    const followers = await this.prisma.reportFollower.findMany({ where: { reportId } })
    const pol = followers.filter((f) => f.actorType === FollowerActorType.POLITICIAN).map((f) => f.actorId)
    const ent = followers.filter((f) => f.actorType === FollowerActorType.ENTITY).map((f) => f.actorId)
    const [a, b] = await Promise.all([
      this.orgMemberIds(OrgType.POLITICIAN, pol),
      this.orgMemberIds(OrgType.ENTITY, ent),
    ])
    return [...a, ...b]
  }

  /** Quem apoiou ou marcou "Eu também". */
  async supporterIds(reportId: string): Promise<string[]> {
    const votes = await this.prisma.vote.findMany({
      where: { reportId, type: { in: [VoteType.SUPPORT, VoteType.ME_TOO] } },
      select: { userId: true },
      take: 5000,
    })
    return votes.map((v) => v.userId)
  }

  async moderatorIds(): Promise<string[]> {
    const mods = await this.prisma.user.findMany({
      where: { type: { in: [UserType.MODERATOR, UserType.ADMIN] }, banned: false },
      select: { id: true },
    })
    return mods.map((m) => m.id)
  }

  private async send(
    userIds: string[],
    type: NotificationType,
    reportId: string,
    metadata: Record<string, unknown>,
    exclude: (string | null | undefined)[] = [],
  ) {
    const excludeUserIds = exclude.filter((v): v is string => !!v)
    const targets = Array.from(new Set(userIds)).filter((id) => !excludeUserIds.includes(id))
    if (targets.length === 0) return
    try {
      await this.notifications.notifyMany({ userIds: targets, type, reportId, metadata })
    } catch (err) {
      this.logger.warn(`Falha ao avisar (${type}) no relato ${reportId}: ${String(err)}`)
    }
  }

  private run(label: string, task: () => Promise<unknown>) {
    task().catch((err) => this.logger.warn(`${label}: ${err instanceof Error ? err.message : String(err)}`))
  }

  // ── Recalcular números ──────────────────────────────────────────────────────

  /** Pressão, SLA e Mandatômetro de quem recebeu e de quem avocou. */
  refreshMetrics(report: Pick<LifecycleReport, 'id' | 'recipientType' | 'recipientId'>) {
    this.run('pressão', async () => this.pressure?.enqueueReport(report.id))
    this.run('SLA', () => syncReportSlaState(this.prisma, report.id))
    this.run('Mandatômetro', async () => {
      const ids = new Set<string>()
      if (report.recipientType === 'POLITICIAN' && report.recipientId) ids.add(report.recipientId)
      const advocacies = await this.prisma.reportAdvocacy.findMany({
        where: { reportId: report.id, orgType: FollowerActorType.POLITICIAN },
        select: { orgId: true },
      })
      advocacies.forEach((a) => ids.add(a.orgId))
      await Promise.all([...ids].map((id) => this.enqueueMandatometer(id)))
    })
  }

  async enqueueMandatometer(politicianId: string) {
    await this.queue.add(
      'refresh-mandatometer',
      { politicianId } satisfies MandatometerRefreshJob,
      {
        // Vários eventos seguidos viram um recálculo só (o job ainda na fila absorve os próximos).
        jobId: `mandatometer-${politicianId}`,
        delay: 3_000,
        removeOnComplete: true,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    )
  }

  private webhookStatus(report: LifecycleReport, from: string, to: string) {
    if (!this.webhooks || !report.recipientId) return
    if (report.recipientType !== 'POLITICIAN' && report.recipientType !== 'ENTITY') return
    this.run('webhook', () =>
      this.webhooks!.enqueueEvent(
        report.recipientType === 'POLITICIAN' ? OrgType.POLITICIAN : OrgType.ENTITY,
        report.recipientId!,
        WebhookEventType.REPORT_STATUS_CHANGED,
        `report.status-${report.id}-${to}-${Date.now()}`,
        { reportId: report.id, previousStatus: from, newStatus: to, category: report.category },
      ),
    )
  }

  // ── Depois de cada ação ─────────────────────────────────────────────────────

  afterStatusChange(report: LifecycleReport, from: string, to: string, actorUserId: string, orgName?: string) {
    const meta = { reportTitle: report.title, previousStatus: from, newStatus: to, orgName }
    this.webhookStatus(report, from, to)
    this.refreshMetrics(report)
    this.run('avisos de status', async () => {
      const [followers, recipient] = await Promise.all([
        this.followerMemberIds(report.id),
        this.recipientMemberIds(report),
      ])
      if (to === ReportStatus.RESOLVED || to === ReportStatus.ARCHIVED) {
        // Autor e apoiadores: "foi resolvido mesmo? confirme ou conteste".
        const supporters = await this.supporterIds(report.id)
        const citizens = [...(report.authorId ? [report.authorId] : []), ...supporters]
        await this.send(citizens, NotificationType.REPORT_RESOLVED, report.id, meta, [actorUserId])
        await this.send([...followers, ...recipient], NotificationType.STATUS_CHANGED, report.id, meta, [
          actorUserId,
          ...citizens,
        ])
        return
      }
      const citizens = report.authorId ? [report.authorId] : []
      await this.send(citizens, NotificationType.STATUS_CHANGED, report.id, meta, [actorUserId])
      await this.send([...followers, ...recipient], NotificationType.STATUS_CHANGED, report.id, meta, [
        actorUserId,
        ...citizens,
      ])
    })
  }

  afterUpdate(report: LifecycleReport, actorUserId: string, firstResponse: boolean, orgName?: string) {
    if (firstResponse) this.refreshMetrics(report)
    this.run('avisos de atualização', async () => {
      const meta = { reportTitle: report.title, orgName }
      const [followers, recipient] = await Promise.all([
        this.followerMemberIds(report.id),
        this.recipientMemberIds(report),
      ])
      const citizens = report.authorId ? [report.authorId] : []
      await this.send(citizens, NotificationType.REPORT_UPDATE, report.id, meta, [actorUserId])
      await this.send([...followers, ...recipient], NotificationType.REPORT_UPDATE, report.id, meta, [
        actorUserId,
        ...citizens,
      ])
    })
  }

  afterAdvocacy(report: LifecycleReport, actorUserId: string, orgName: string, withdrawn: boolean) {
    this.refreshMetrics(report)
    if (withdrawn) {
      this.run('aviso de desistência', async () => {
        const citizens = report.authorId ? [report.authorId] : []
        await this.send(citizens, NotificationType.REPORT_UPDATE, report.id, { reportTitle: report.title, orgName }, [actorUserId])
      })
      return
    }
    this.run('avisos de avocação', async () => {
      const meta = { reportTitle: report.title, orgName }
      const [recipient, supporters] = await Promise.all([
        this.recipientMemberIds(report),
        this.supporterIds(report.id),
      ])
      const citizens = [...(report.authorId ? [report.authorId] : []), ...supporters]
      await this.send(citizens, NotificationType.REPORT_ADVOCATED, report.id, meta, [actorUserId])
      await this.send(recipient, NotificationType.REPORT_ADVOCATED, report.id, meta, [actorUserId, ...citizens])
    })
  }

  afterDispute(report: LifecycleReport, from: string, actorUserId: string) {
    this.webhookStatus(report, from, ReportStatus.DISPUTED)
    this.refreshMetrics(report)
    this.run('avisos de contestação', async () => {
      const meta = { reportTitle: report.title, previousStatus: from }
      const [followers, recipient, mods] = await Promise.all([
        this.followerMemberIds(report.id),
        this.recipientMemberIds(report),
        this.moderatorIds(),
      ])
      await this.send([...recipient, ...followers], NotificationType.REPORT_DISPUTED, report.id, meta, [actorUserId])
      await this.send(mods, NotificationType.DISPUTE_PENDING_REVIEW, report.id, meta, [actorUserId])
    })
  }

  afterDisputeDecision(
    report: LifecycleReport,
    decision: 'UPHOLD' | 'REOPEN',
    newStatus: string,
    actorUserId: string,
    disputerUserId: string | null,
  ) {
    this.webhookStatus(report, ReportStatus.DISPUTED, newStatus)
    this.refreshMetrics(report)
    this.run('avisos da decisão', async () => {
      const meta = { reportTitle: report.title, decision, newStatus, previousStatus: ReportStatus.DISPUTED }
      const [followers, recipient] = await Promise.all([
        this.followerMemberIds(report.id),
        this.recipientMemberIds(report),
      ])
      const citizens = [
        ...(report.authorId ? [report.authorId] : []),
        ...(disputerUserId ? [disputerUserId] : []),
      ]
      await this.send([...citizens, ...followers, ...recipient], NotificationType.DISPUTE_DECIDED, report.id, meta, [actorUserId])
    })
  }

  afterConfirmation(report: LifecycleReport, actorUserId: string) {
    this.refreshMetrics(report)
    this.run('aviso de confirmação', async () => {
      const [followers, recipient] = await Promise.all([
        this.followerMemberIds(report.id),
        this.recipientMemberIds(report),
      ])
      await this.send([...followers, ...recipient], NotificationType.REPORT_UPDATE, report.id, {
        reportTitle: report.title,
        confirmed: true,
      }, [actorUserId])
    })
  }
}
