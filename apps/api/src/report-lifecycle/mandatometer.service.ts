import { Injectable, Logger, Optional } from '@nestjs/common'
import { FollowerActorType, PoliticianStatus, Prisma } from '@prisma/client'
import { ACTIVE_REPORT_STATUSES, EventType, ReportStatus, TIMELINE_ACTIONS } from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { ShareCardsService } from '../share-cards/share-cards.service'

export interface MandatometerCommitments {
  /** Avocações feitas (ativas ou encerradas). */
  total: number
  /** Avocações ativas em relatos já resolvidos. */
  fulfilled: number
  /** Avocações ativas em relatos ainda sem solução. */
  inProgress: number
  /** Avocações ativas com prazo prometido vencido e relato sem solução. */
  overdue: number
  /** Desistências públicas. */
  withdrawn: number
  /** Compromissos que o fim do mandato encontrou sem solução. */
  abandoned: number
}

export interface MandatometerSnapshot {
  // Relatos recebidos (o político é o destinatário)
  total: number
  open: number
  inProgress: number
  resolved: number
  disputed: number
  archived: number
  responded: number
  confirmed: number
  everDisputed: number
  disputesUpheld: number
  closedEver: number
  byStatus: Record<string, number>
  byCategory: Array<{ category: string; count: number }>
  // Compromissos assumidos (avocações)
  commitments: MandatometerCommitments
  /** Compatibilidade com telas antigas: total de avocações. */
  advocated: number
  computedAt: string
  frozenAt?: string
}

export interface MandatometerMetrics {
  responseRate: number
  resolutionRate: number
  contestationRate: number
  disputesUpheldRate: number
  confirmedRate: number
  commitmentRate: number
  trustBadge: boolean
  classification: string
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/**
 * Mandatômetro: uma conta só, recalculada do zero a partir dos relatos e das avocações.
 * Separa o que o político RECEBEU do que ele ASSUMIU (avocou), e não esquece contestação procedente.
 */
@Injectable()
export class MandatometerService {
  private readonly logger = new Logger(MandatometerService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly shareCards?: ShareCardsService,
  ) {}

  async compute(politicianId: string, now = new Date()): Promise<MandatometerSnapshot> {
    const where: Prisma.ReportWhereInput = { recipientType: 'POLITICIAN', recipientId: politicianId }
    const [byStatusRaw, byCategoryRaw, responded, confirmed, everDisputed, closedEver, disputesUpheld, advocacies] =
      await Promise.all([
        this.prisma.report.groupBy({ by: ['status'], where, _count: true }),
        this.prisma.report.groupBy({ by: ['category'], where, _count: true }),
        this.prisma.report.count({ where: { ...where, firstResponseAt: { not: null } } }),
        this.prisma.report.count({
          where: { ...where, status: ReportStatus.RESOLVED, resolutionConfirmedAt: { not: null } },
        }),
        this.prisma.report.count({ where: { ...where, timeline: { some: { type: EventType.DISPUTED } } } }),
        this.prisma.report.count({
          where: {
            ...where,
            OR: [
              { status: { in: [ReportStatus.RESOLVED, ReportStatus.ARCHIVED, ReportStatus.DISPUTED] } },
              { timeline: { some: { type: EventType.DISPUTED } } },
            ],
          },
        }),
        this.prisma.timelineEvent.count({
          where: {
            report: where,
            type: EventType.STATUS_CHANGED,
            AND: [
              { metadata: { path: ['action'], equals: TIMELINE_ACTIONS.DISPUTE_DECIDED } },
              { metadata: { path: ['decision'], equals: 'REOPEN' } },
            ],
          },
        }),
        this.prisma.reportAdvocacy.findMany({
          where: { orgType: FollowerActorType.POLITICIAN, orgId: politicianId },
          select: { closedAt: true, closedReason: true, promisedFor: true, report: { select: { status: true } } },
        }),
      ])

    const byStatus = byStatusRaw.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: r._count }), {})
    const total = byStatusRaw.reduce((s, r) => s + r._count, 0)
    const active = new Set<string>([...ACTIVE_REPORT_STATUSES, ReportStatus.DISPUTED])

    const commitments: MandatometerCommitments = { total: advocacies.length, fulfilled: 0, inProgress: 0, overdue: 0, withdrawn: 0, abandoned: 0 }
    for (const a of advocacies) {
      if (a.closedReason === 'WITHDRAWN') commitments.withdrawn += 1
      else if (a.closedReason === 'MANDATE_ENDED') commitments.abandoned += 1
      else if (a.report.status === ReportStatus.RESOLVED) commitments.fulfilled += 1
      else if (active.has(a.report.status)) {
        commitments.inProgress += 1
        if (a.promisedFor && a.promisedFor.getTime() < now.getTime()) commitments.overdue += 1
      }
    }

    return {
      total,
      open: byStatus[ReportStatus.OPEN] ?? 0,
      inProgress: (byStatus[ReportStatus.IN_PROGRESS] ?? 0) + (byStatus[ReportStatus.UNDER_REVIEW] ?? 0),
      resolved: byStatus[ReportStatus.RESOLVED] ?? 0,
      disputed: byStatus[ReportStatus.DISPUTED] ?? 0,
      archived: byStatus[ReportStatus.ARCHIVED] ?? 0,
      responded,
      confirmed,
      everDisputed,
      disputesUpheld,
      closedEver,
      byStatus,
      byCategory: byCategoryRaw
        .sort((a, b) => b._count - a._count)
        .map((r) => ({ category: r.category, count: r._count })),
      commitments,
      advocated: commitments.total,
      computedAt: now.toISOString(),
    }
  }

  metrics(s: MandatometerSnapshot): MandatometerMetrics {
    const responseRate = pct(s.responded, s.total)
    const resolutionRate = pct(s.resolved, s.total)
    const contestationRate = pct(s.everDisputed, s.closedEver)
    const disputesUpheldRate = pct(s.disputesUpheld, s.everDisputed)
    const confirmedRate = pct(s.confirmed, s.resolved)
    const decided = s.commitments.total - s.commitments.inProgress
    const commitmentRate = pct(s.commitments.fulfilled, decided)
    const trustBadge = responseRate >= 60 && resolutionRate >= 50 && disputesUpheldRate < 25
    const classification =
      resolutionRate >= 60 ? 'Político Ativo' : resolutionRate >= 30 ? 'Político Regular' : 'Político Inativo'
    return {
      responseRate,
      resolutionRate,
      contestationRate,
      disputesUpheldRate,
      confirmedRate,
      commitmentRate,
      trustBadge,
      classification,
    }
  }

  /** Grava o retrato atual. Mandato encerrado fica congelado no retrato do encerramento. */
  async refresh(politicianId: string): Promise<void> {
    const p = await this.prisma.politician.findUnique({ where: { id: politicianId }, select: { status: true } })
    if (!p || p.status === PoliticianStatus.ENCERRADO) return
    const snapshot = await this.compute(politicianId)
    await this.prisma.politician.update({
      where: { id: politicianId },
      data: { mandatometer: snapshot as unknown as Prisma.InputJsonValue },
    })
    await this.shareCards?.invalidateOnMetricChange(politicianId).catch((err: unknown) => {
      this.logger.warn(`Falha ao renovar cards do político ${politicianId}: ${String(err)}`)
    })
  }

  async freeze(politicianId: string): Promise<void> {
    const snapshot = await this.compute(politicianId)
    await this.prisma.politician.update({
      where: { id: politicianId },
      data: { mandatometer: { ...snapshot, frozenAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue },
    })
  }
}
