import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import {
  Category,
  EventType,
  MembershipStatus,
  NotificationType,
  OrgPermission,
  OrgType,
  Prisma,
  RecipientType,
  ReportStatus,
  SlaState,
  WebhookEventType,
} from '@prisma/client'
import {
  ANALYTICS_DEFINITION_VERSION,
  ANALYTICS_TIMEZONE,
  Category as SharedCategory,
  DEFAULT_SLA_ESCALATION_HOURS,
  DEFAULT_SLA_HOURS_BY_CATEGORY,
  EventType as SharedEventType,
  computePercentileFromBuckets,
  computeSla,
  hasConfiguredOwnSla,
  toSaoPauloDateKey,
  RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
} from '@votz/shared-types'
import { AnalyticsRepository } from '../analytics/analytics.repository'
import { addDaysDateString, buildRatio, toSaoPauloDateString } from '../analytics/analytics.constants'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { recordOrgAudit } from '../common/audit/org-audit'
import { MailService } from '../mail/mail.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import {
  AssignReportDto,
  SlaPerformanceQueryDto,
  SlaQueueFilterDto,
  UpdateSlaPolicyDto,
} from './dto/sla.dto'

export const SLA_QUEUE = 'sla-watcher'

const ACTIVE_QUEUE_STATUSES: ReportStatus[] = [
  ReportStatus.OPEN,
  ReportStatus.UNDER_REVIEW,
  ReportStatus.IN_PROGRESS,
  ReportStatus.DISPUTED,
]

interface EntityPolicyCacheItem {
  id: string
  legalName: string
  slaHours: Record<string, number> | null
  resolutionSlaHours: Record<string, number> | null
  slaEscalationHours: number
}

@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsRepo: AnalyticsRepository,
    private readonly notifications: NotificationsService,
    private readonly timeline: TimelineService,
    private readonly mail: MailService,
    @Optional() private readonly webhooks?: WebhooksService,
  ) {}

  async listAssignableMembers(user: ActingUser) {
    const acting = await requireActingOrg(this.prisma, user, 'ENTITY', OrgPermission.VIEW_ANALYTICS)
    const members = await this.prisma.orgMembership.findMany({
      where: { orgType: OrgType.ENTITY, orgId: acting.orgId, status: MembershipStatus.ACTIVE },
      select: {
        userId: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
        role: { select: { id: true, name: true, permissions: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      roleName: m.role.name,
      canRespond: m.role.permissions.includes(OrgPermission.RESPOND_REPORTS),
      canAssign: m.role.permissions.includes(OrgPermission.ASSIGN_REPORTS),
    }))
  }

  async listQueue(user: ActingUser, query: SlaQueueFilterDto, now = new Date()) {
    const acting = await requireActingOrg(this.prisma, user, 'ENTITY', OrgPermission.VIEW_ANALYTICS)
    const page = query.page ?? 1
    const limit = query.limit ?? 25

    const todayStartUtc = this.startOfSaoPauloDay(now)
    const todayEndUtc = new Date(todayStartUtc.getTime() + 86_400_000 - 1)

    const baseWhere: Prisma.ReportWhereInput = {
      recipientType: RecipientType.ENTITY,
      recipientId: acting.orgId,
      status: { in: ACTIVE_QUEUE_STATUSES },
    }

    const scopeWhere: Prisma.ReportWhereInput = { ...baseWhere }
    if (query.category) scopeWhere.category = query.category
    if (query.neighborhood?.trim()) {
      scopeWhere.neighborhood = { contains: query.neighborhood.trim(), mode: 'insensitive' }
    }

    const where: Prisma.ReportWhereInput = { ...scopeWhere }
    if (query.urgency === 'BREACHED') {
      where.slaState = SlaState.BREACHED
    } else if (query.urgency === 'AT_RISK') {
      where.slaState = SlaState.AT_RISK
    } else if (query.urgency === 'ON_TIME') {
      where.slaState = SlaState.ON_TIME
    } else if (query.urgency === 'NO_SLA') {
      where.OR = [{ slaState: null }, { slaState: { notIn: [SlaState.BREACHED, SlaState.AT_RISK, SlaState.ON_TIME] } }]
    } else if (query.urgency === 'DUE_TODAY') {
      where.slaState = { in: [SlaState.ON_TIME, SlaState.AT_RISK] }
      where.slaDueAt = { gte: todayStartUtc, lte: todayEndUtc }
    }

    if (query.assignee === 'MINE') {
      where.assignments = {
        some: { orgType: OrgType.ENTITY, orgId: acting.orgId, active: true, assigneeUserId: user.id },
      }
    } else if (query.assignee === 'UNASSIGNED') {
      where.assignments = {
        none: { orgType: OrgType.ENTITY, orgId: acting.orgId, active: true },
      }
    } else if (query.assignee && query.assignee !== 'ALL') {
      where.assignments = {
        some: {
          orgType: OrgType.ENTITY,
          orgId: acting.orgId,
          active: true,
          assigneeUserId: query.assignee,
        },
      }
    }

    const orderBy: Prisma.ReportOrderByWithRelationInput[] =
      query.sortBy === 'pressure_desc'
        ? [{ pressureScore: 'desc' }, { slaDueAt: 'asc' }]
        : query.sortBy === 'newest'
          ? [{ createdAt: 'desc' }]
          : [{ slaDueAt: 'asc' }, { pressureScore: 'desc' }]

    const [
      total,
      rows,
      totalOpenCount,
      breachedCount,
      atRiskCount,
      onTimeCount,
      dueTodayCount,
      unassignedCount,
      mineCount,
    ] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          neighborhood: true,
          city: true,
          state: true,
          pressureScore: true,
          createdAt: true,
          firstResponseAt: true,
          slaStartedAt: true,
          slaDueAt: true,
          slaState: true,
          slaMetAt: true,
          resolutionSlaDueAt: true,
          resolutionSlaState: true,
          assignments: {
            where: { orgType: OrgType.ENTITY, orgId: acting.orgId, active: true },
            take: 1,
            select: {
              id: true,
              assigneeUserId: true,
              createdAt: true,
              note: true,
            },
          },
        },
      }),
      this.prisma.report.count({ where: scopeWhere }),
      this.prisma.report.count({ where: { ...scopeWhere, slaState: SlaState.BREACHED } }),
      this.prisma.report.count({ where: { ...scopeWhere, slaState: SlaState.AT_RISK } }),
      this.prisma.report.count({ where: { ...scopeWhere, slaState: SlaState.ON_TIME } }),
      this.prisma.report.count({
        where: {
          ...scopeWhere,
          slaState: { in: [SlaState.ON_TIME, SlaState.AT_RISK] },
          slaDueAt: { gte: todayStartUtc, lte: todayEndUtc },
        },
      }),
      this.prisma.report.count({
        where: {
          ...scopeWhere,
          assignments: { none: { orgType: OrgType.ENTITY, orgId: acting.orgId, active: true } },
        },
      }),
      this.prisma.report.count({
        where: {
          ...scopeWhere,
          assignments: {
            some: {
              orgType: OrgType.ENTITY,
              orgId: acting.orgId,
              active: true,
              assigneeUserId: user.id,
            },
          },
        },
      }),
    ])

    const assigneeIds = Array.from(
      new Set(
        rows
          .map((r) => r.assignments[0]?.assigneeUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const users = assigneeIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : []
    const userMap = new Map(users.map((u) => [u.id, u]))
    const nowDaySp = toSaoPauloDateKey(now)

    const items = rows.map((r) => {
      const activeAssign = r.assignments[0] ?? null
      const dueSp = r.slaDueAt ? toSaoPauloDateKey(r.slaDueAt) : null
      const isDueToday =
        dueSp === nowDaySp && (r.slaState === SlaState.ON_TIME || r.slaState === SlaState.AT_RISK)
      const hoursRemaining = r.slaDueAt
        ? Number(((r.slaDueAt.getTime() - now.getTime()) / 3_600_000).toFixed(1))
        : null

      return {
        id: r.id,
        title: r.title,
        category: r.category,
        status: r.status,
        neighborhood: r.neighborhood,
        city: r.city,
        state: r.state,
        pressureScore: r.pressureScore,
        createdAt: r.createdAt,
        firstResponseAt: r.firstResponseAt,
        slaStartedAt: r.slaStartedAt,
        slaDueAt: r.slaDueAt,
        slaState: r.slaState,
        slaMetAt: r.slaMetAt,
        resolutionSlaDueAt: r.resolutionSlaDueAt,
        resolutionSlaState: r.resolutionSlaState,
        isDueToday,
        hoursRemaining,
        assignment: activeAssign
          ? {
              id: activeAssign.id,
              assignedAt: activeAssign.createdAt,
              note: activeAssign.note,
              assignee: activeAssign.assigneeUserId
                ? (userMap.get(activeAssign.assigneeUserId) ?? {
                    id: activeAssign.assigneeUserId,
                    name: 'Membro',
                    avatarUrl: null,
                  })
                : null,
            }
          : null,
      }
    })

    return {
      summary: {
        totalOpen: totalOpenCount,
        breached: breachedCount,
        dueToday: dueTodayCount,
        atRisk: atRiskCount,
        onTime: onTimeCount,
        noSla: Math.max(0, totalOpenCount - (breachedCount + atRiskCount + onTimeCount)),
        unassigned: unassignedCount,
        mine: mineCount,
      },
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    }
  }

  async assignReport(user: ActingUser, reportId: string, dto: AssignReportDto) {
    const acting = await requireActingOrg(this.prisma, user, 'ENTITY', OrgPermission.ASSIGN_REPORTS)

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        recipientType: true,
        recipientId: true,
        slaDueAt: true,
      },
    })
    if (!report) throw new NotFoundException('Relato não encontrado')
    if (report.recipientType !== RecipientType.ENTITY || report.recipientId !== acting.orgId) {
      throw new ForbiddenException('Este relato não pertence à entidade do contexto ativo.')
    }

    let assigneeName: string | null = null
    if (dto.assigneeUserId) {
      const membership = await this.prisma.orgMembership.findUnique({
        where: {
          userId_orgType_orgId: {
            userId: dto.assigneeUserId,
            orgType: OrgType.ENTITY,
            orgId: acting.orgId,
          },
        },
        select: {
          status: true,
          user: { select: { name: true } },
        },
      })
      if (!membership) {
        throw new BadRequestException('Usuário alvo não pertence a esta organização.')
      }
      if (membership.status !== MembershipStatus.ACTIVE) {
        throw new BadRequestException('Apenas membros ACTIVE da mesma entidade podem receber atribuições.')
      }
      assigneeName = membership.user.name
    }

    const now = new Date()
    const createdAssignment = await this.prisma.$transaction(async (tx) => {
      await tx.orgReportAssignment.updateMany({
        where: { orgType: OrgType.ENTITY, orgId: acting.orgId, reportId, active: true },
        data: { active: false, endedAt: now },
      })

      const row = await tx.orgReportAssignment.create({
        data: {
          orgType: OrgType.ENTITY,
          orgId: acting.orgId,
          reportId,
          assigneeUserId: dto.assigneeUserId ?? null,
          assignedById: user.id,
          active: Boolean(dto.assigneeUserId),
          endedAt: dto.assigneeUserId ? null : now,
          note: dto.note?.trim() || null,
        },
      })

      await recordOrgAudit(tx, {
        action: 'CREATED',
        orgType: OrgType.ENTITY,
        orgId: acting.orgId,
        itemType: 'REPORT_ASSIGNMENT',
        itemId: row.id,
        actorId: user.id,
        summary: dto.assigneeUserId
          ? `Relato atribuído na fila da entidade`
          : `Atribuição removida na fila da entidade`,
      })

      return row
    })

    if (dto.assigneeUserId && dto.assigneeUserId !== user.id) {
      this.notifications
        .notify({
          userId: dto.assigneeUserId,
          type: NotificationType.REPORT_ASSIGNED,
          reportId,
          metadata: {
            entityId: acting.orgId,
            reportTitle: report.title,
            category: report.category,
          },
        })
        .catch(() => null)
    }

    this.webhooks
      ?.enqueueEvent(
        OrgType.ENTITY,
        acting.orgId,
        WebhookEventType.REPORT_ASSIGNED,
        `report.assigned:${reportId}:${createdAssignment.id}`,
        {
          reportId,
          category: report.category,
          status: report.status,
          slaDueAt: report.slaDueAt,
          assigned: Boolean(dto.assigneeUserId),
          assignedAt: createdAssignment.createdAt,
        },
      )
      .catch(() => null)

    return {
      assignmentId: createdAssignment.id,
      reportId,
      assigneeUserId: dto.assigneeUserId ?? null,
      assigneeName,
      active: createdAssignment.active,
      createdAt: createdAssignment.createdAt,
    }
  }

  async getAssignmentHistory(user: ActingUser, reportId: string) {
    const acting = await requireActingOrg(this.prisma, user, 'ENTITY', OrgPermission.VIEW_ANALYTICS)
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { recipientType: true, recipientId: true },
    })
    if (!report) throw new NotFoundException('Relato não encontrado')
    if (report.recipientType !== RecipientType.ENTITY || report.recipientId !== acting.orgId) {
      throw new ForbiddenException('Este relato não pertence à entidade do contexto ativo.')
    }

    const history = await this.prisma.orgReportAssignment.findMany({
      where: { orgType: OrgType.ENTITY, orgId: acting.orgId, reportId },
      orderBy: { createdAt: 'desc' },
    })
    const userIds = Array.from(
      new Set(
        history
          .flatMap((h) => [h.assigneeUserId, h.assignedById])
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : []
    const userMap = new Map(users.map((u) => [u.id, u.name]))

    return history.map((h) => ({
      id: h.id,
      assigneeUserId: h.assigneeUserId,
      assigneeName: h.assigneeUserId ? (userMap.get(h.assigneeUserId) ?? 'Membro') : null,
      assignedById: h.assignedById,
      assignedByName: h.assignedById ? (userMap.get(h.assignedById) ?? 'Gestor') : null,
      active: h.active,
      note: h.note,
      createdAt: h.createdAt,
      endedAt: h.endedAt,
    }))
  }

  async getTeamWorkload(user: ActingUser, now = new Date()) {
    const acting = await requireActingOrg(this.prisma, user, 'ENTITY', OrgPermission.VIEW_ANALYTICS)
    const nowDaySp = toSaoPauloDateKey(now)

    const [members, activeAssignments] = await Promise.all([
      this.prisma.orgMembership.findMany({
        where: { orgType: OrgType.ENTITY, orgId: acting.orgId, status: MembershipStatus.ACTIVE },
        select: {
          userId: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
          role: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.orgReportAssignment.findMany({
        where: {
          orgType: OrgType.ENTITY,
          orgId: acting.orgId,
          active: true,
          assigneeUserId: { not: null },
          report: {
            recipientType: RecipientType.ENTITY,
            recipientId: acting.orgId,
            status: { in: ACTIVE_QUEUE_STATUSES },
          },
        },
        select: {
          assigneeUserId: true,
          report: {
            select: {
              id: true,
              slaState: true,
              slaDueAt: true,
            },
          },
        },
      }),
    ])

    const statsByMember = new Map<
      string,
      { totalAssigned: number; breached: number; atRisk: number; dueToday: number; onTime: number }
    >()

    for (const m of members) {
      statsByMember.set(m.userId, {
        totalAssigned: 0,
        breached: 0,
        atRisk: 0,
        dueToday: 0,
        onTime: 0,
      })
    }

    for (const a of activeAssignments) {
      if (!a.assigneeUserId) continue
      const bucket = statsByMember.get(a.assigneeUserId)
      if (!bucket) continue
      bucket.totalAssigned += 1
      const st = a.report.slaState
      if (st === SlaState.BREACHED) bucket.breached += 1
      else if (st === SlaState.AT_RISK) bucket.atRisk += 1
      else if (st === SlaState.ON_TIME) bucket.onTime += 1

      if (
        a.report.slaDueAt &&
        toSaoPauloDateKey(a.report.slaDueAt) === nowDaySp &&
        (st === SlaState.ON_TIME || st === SlaState.AT_RISK)
      ) {
        bucket.dueToday += 1
      }
    }

    const unassignedCount = await this.prisma.report.count({
      where: {
        recipientType: RecipientType.ENTITY,
        recipientId: acting.orgId,
        status: { in: ACTIVE_QUEUE_STATUSES },
        assignments: { none: { orgType: OrgType.ENTITY, orgId: acting.orgId, active: true } },
      },
    })

    return {
      unassignedCount,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        roleName: m.role.name,
        ...(statsByMember.get(m.userId) ?? {
          totalAssigned: 0,
          breached: 0,
          atRisk: 0,
          dueToday: 0,
          onTime: 0,
        }),
      })),
    }
  }

  async getPolicy(user: ActingUser) {
    const acting = await requireActingOrg(this.prisma, user, 'ENTITY', OrgPermission.VIEW_ANALYTICS)
    const entity = await this.prisma.entity.findUnique({
      where: { id: acting.orgId },
      select: {
        id: true,
        legalName: true,
        slaHours: true,
        resolutionSlaHours: true,
        slaEscalationHours: true,
        autoMonthlyReportEnabled: true,
      },
    })
    if (!entity) throw new NotFoundException('Entidade não encontrada')

    const slaHours = (entity.slaHours as Record<string, number> | null) ?? {}
    return {
      entityId: entity.id,
      legalName: entity.legalName,
      hasOwnSla: hasConfiguredOwnSla(slaHours),
      slaHours,
      resolutionSlaHours: (entity.resolutionSlaHours as Record<string, number> | null) ?? {},
      defaultSlaHoursByCategory: DEFAULT_SLA_HOURS_BY_CATEGORY,
      slaEscalationHours: entity.slaEscalationHours,
      autoMonthlyReportEnabled: entity.autoMonthlyReportEnabled,
    }
  }

  async updatePolicy(user: ActingUser, dto: UpdateSlaPolicyDto, now = new Date()) {
    const acting = await requireActingOrg(this.prisma, user, 'ENTITY', OrgPermission.MANAGE_PROFILE)

    const current = await this.prisma.entity.findUnique({
      where: { id: acting.orgId },
      select: {
        id: true,
        slaHours: true,
        resolutionSlaHours: true,
        slaEscalationHours: true,
        autoMonthlyReportEnabled: true,
      },
    })
    if (!current) throw new NotFoundException('Entidade não encontrada')

    const mergedSlaHours =
      dto.slaHours !== undefined
        ? ({ ...((current.slaHours as Record<string, number> | null) ?? {}), ...dto.slaHours } as Prisma.InputJsonValue)
        : undefined
    const mergedResolutionSlaHours =
      dto.resolutionSlaHours !== undefined
        ? ({
            ...((current.resolutionSlaHours as Record<string, number> | null) ?? {}),
            ...dto.resolutionSlaHours,
          } as Prisma.InputJsonValue)
        : undefined

    const updated = await this.prisma.entity.update({
      where: { id: acting.orgId },
      data: {
        ...(mergedSlaHours !== undefined ? { slaHours: mergedSlaHours } : {}),
        ...(mergedResolutionSlaHours !== undefined
          ? { resolutionSlaHours: mergedResolutionSlaHours }
          : {}),
        ...(dto.slaEscalationHours !== undefined
          ? { slaEscalationHours: dto.slaEscalationHours }
          : {}),
        ...(dto.autoMonthlyReportEnabled !== undefined
          ? { autoMonthlyReportEnabled: dto.autoMonthlyReportEnabled }
          : {}),
      },
      select: {
        id: true,
        slaHours: true,
        resolutionSlaHours: true,
        slaEscalationHours: true,
        autoMonthlyReportEnabled: true,
      },
    })

    let recalculatedOpenCount = 0
    if (dto.recalculateOpen === true) {
      recalculatedOpenCount = await this.recalculateOpenReportsForEntity(
        acting.orgId,
        {
          slaHours: (updated.slaHours as Record<string, number> | null) ?? null,
          resolutionSlaHours: (updated.resolutionSlaHours as Record<string, number> | null) ?? null,
          escalationHours: updated.slaEscalationHours,
        },
        now,
      )
      await recordOrgAudit(this.prisma, {
        action: 'CREATED',
        orgType: OrgType.ENTITY,
        orgId: acting.orgId,
        itemType: 'SLA_POLICY_RECALCULATE_OPEN',
        itemId: acting.orgId,
        actorId: user.id,
        summary: `Recálculo explícito de SLA em ${recalculatedOpenCount} relato(s) aberto(s)`,
      })
    }

    return {
      slaHours: (updated.slaHours as Record<string, number> | null) ?? {},
      resolutionSlaHours: (updated.resolutionSlaHours as Record<string, number> | null) ?? {},
      slaEscalationHours: updated.slaEscalationHours,
      autoMonthlyReportEnabled: updated.autoMonthlyReportEnabled,
      recalculatedOpenCount,
      prospectiveOnly: dto.recalculateOpen !== true,
    }
  }

  async recalculateOpenReportsForEntity(
    entityId: string,
    policy: {
      slaHours: Record<string, number> | null
      resolutionSlaHours: Record<string, number> | null
      escalationHours: number
    },
    now = new Date(),
  ): Promise<number> {
    const openReports = await this.prisma.report.findMany({
      where: {
        recipientType: RecipientType.ENTITY,
        recipientId: entityId,
        status: { in: ACTIVE_QUEUE_STATUSES },
        firstResponseAt: null,
      },
      select: {
        id: true,
        category: true,
        status: true,
        createdAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        slaStartedAt: true,
        slaState: true,
      },
    })

    let updatedCount = 0
    for (const r of openReports) {
      const computed = computeSla(
        {
          category: r.category as unknown as SharedCategory,
          status: r.status,
          createdAt: r.createdAt,
          firstResponseAt: r.firstResponseAt,
          resolvedAt: r.resolvedAt,
          slaStartedAt: r.slaStartedAt ?? r.createdAt,
          slaState: (r.slaState as any) ?? null,
        },
        policy,
        now,
      )
      await this.prisma.report.update({
        where: { id: r.id },
        data: {
          slaStartedAt: computed.slaStartedAt,
          slaDueAt: computed.slaDueAt,
          slaState: (computed.slaState as SlaState | null) ?? SlaState.ON_TIME,
          slaMetAt: computed.slaMetAt,
          resolutionSlaDueAt: computed.resolution?.dueAt ?? null,
          resolutionSlaState: (computed.resolution?.state as SlaState | null) ?? null,
          resolutionSlaMetAt: computed.resolution?.metAt ?? null,
        },
      })
      updatedCount++
    }
    return updatedCount
  }

  async getPerformance(user: ActingUser, query: SlaPerformanceQueryDto, now = new Date()) {
    const acting = await requireActingOrg(this.prisma, user, 'ENTITY', OrgPermission.VIEW_ANALYTICS)
    const todayStr = toSaoPauloDateString(now)
    const toStr = query.to ?? todayStr
    const fromStr = query.from ?? addDaysDateString(toStr, -89)
    const matureCutoff = addDaysDateString(todayStr, -7)

    const filter = {
      recipientType: RecipientType.ENTITY,
      recipientId: acting.orgId,
      from: fromStr,
      to: toStr,
      category: query.category,
    }

    const [entity, summary, categories, dailySeries] = await Promise.all([
      this.prisma.entity.findUnique({
        where: { id: acting.orgId },
        select: { slaHours: true, resolutionSlaHours: true, slaEscalationHours: true },
      }),
      this.analyticsRepo.fetchDirectedSummary(filter, matureCutoff),
      this.analyticsRepo.fetchCategoryBreakdown('directed', null, filter, matureCutoff),
      this.analyticsRepo.fetchDailySeries('directed', null, filter, matureCutoff),
    ])

    const slaHours = (entity?.slaHours as Record<string, number> | null) ?? {}
    const hasOwnSla = hasConfiguredOwnSla(slaHours)
    const totalEvaluated = summary.slaMetCount + summary.slaBreachedCount

    const byCategory = categories.map((c) => {
      const catDen = c.slaMetCount + c.slaBreachedCount
      const ownHours = slaHours[c.category]
      const isDefaultPolicy = !(typeof ownHours === 'number' && Number.isFinite(ownHours) && ownHours > 0)
      const declaredHours = isDefaultPolicy ? (DEFAULT_SLA_HOURS_BY_CATEGORY[c.category] ?? 120) : ownHours
      const medianResponseHours =
        c.responseCount > 0
          ? computePercentileFromBuckets(c.respBuckets, RESPONSE_TIME_BUCKET_BOUNDS_HOURS, 50)
          : null

      return {
        category: c.category,
        declaredHours,
        isDefaultPolicy,
        medianResponseHours,
        slaMet: c.slaMetCount,
        slaBreached: c.slaBreachedCount,
        complianceRate: buildRatio(c.slaMetCount, catDen, 100),
      }
    })

    const monthlyMap = new Map<string, { month: string; slaMet: number; slaBreached: number; created: number }>()
    for (const dayRow of dailySeries) {
      const month = dayRow.day.slice(0, 7)
      const existing = monthlyMap.get(month) ?? { month, slaMet: 0, slaBreached: 0, created: 0 }
      existing.slaMet += dayRow.slaMetCount
      existing.slaBreached += dayRow.slaBreachedCount
      existing.created += dayRow.createdCount
      monthlyMap.set(month, existing)
    }

    const monthlyEvolution = Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        month: m.month,
        createdCount: m.created,
        slaMet: m.slaMet,
        slaBreached: m.slaBreached,
        complianceRate: buildRatio(m.slaMet, m.slaMet + m.slaBreached, 100),
      }))

    return {
      definitionVersion: ANALYTICS_DEFINITION_VERSION,
      timezone: ANALYTICS_TIMEZONE,
      hasOwnSla,
      period: { from: fromStr, to: toStr },
      summary: {
        slaMet: summary.slaMetCount,
        slaBreached: summary.slaBreachedCount,
        evaluated: totalEvaluated,
        complianceRate: buildRatio(summary.slaMetCount, totalEvaluated, 100),
        firstResponseMedianH:
          summary.responseCount > 0
            ? computePercentileFromBuckets(summary.respBuckets, RESPONSE_TIME_BUCKET_BOUNDS_HOURS, 50)
            : null,
      },
      byCategory,
      monthlyEvolution,
    }
  }

  /**
   * Varredura em lotes indexada via cursor id: marca 75% (AT_RISK), vencimento (BREACHED),
   * grava evento público na timeline (sem nome de servidor), deduplica notificações via SlaNotificationLog
   * e envia e-mails agrupados por entidade + escalonamento para Gestor/Proprietário.
   */
  async runSlaSweep(now = new Date(), batchSize = 500): Promise<{
    scanned: number
    transitionedAtRisk: number
    transitionedBreached: number
    notificationsSent: number
    escalationsSent: number
  }> {
    const entityCache = new Map<string, EntityPolicyCacheItem>()
    let cursorId: string | undefined
    let scanned = 0
    let transitionedAtRisk = 0
    let transitionedBreached = 0
    let notificationsSent = 0
    let escalationsSent = 0

    const digestPerEntity = new Map<
      string,
      {
        orgName: string
        atRiskCount: number
        breachedCount: number
        escalatedCount: number
        highlights: Array<{ reportId: string; title: string; category: string; stageLabel: string }>
      }
    >()

    while (true) {
      const batch = await this.prisma.report.findMany({
        where: {
          recipientType: RecipientType.ENTITY,
          recipientId: { not: null },
          status: { in: ACTIVE_QUEUE_STATUSES },
          slaDueAt: { not: null },
          slaState: { in: [SlaState.ON_TIME, SlaState.AT_RISK, SlaState.BREACHED] },
        },
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          recipientId: true,
          createdAt: true,
          firstResponseAt: true,
          resolvedAt: true,
          slaStartedAt: true,
          slaDueAt: true,
          slaState: true,
          resolutionSlaDueAt: true,
          resolutionSlaState: true,
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      })

      if (batch.length === 0) break
      scanned += batch.length
      cursorId = batch[batch.length - 1].id

      const missingEntityIds = Array.from(
        new Set(batch.map((r) => r.recipientId!).filter((id) => !entityCache.has(id))),
      )
      if (missingEntityIds.length > 0) {
        const entities = await this.prisma.entity.findMany({
          where: { id: { in: missingEntityIds } },
          select: {
            id: true,
            legalName: true,
            slaHours: true,
            resolutionSlaHours: true,
            slaEscalationHours: true,
          },
        })
        for (const e of entities) {
          entityCache.set(e.id, {
            id: e.id,
            legalName: e.legalName,
            slaHours: (e.slaHours as Record<string, number> | null) ?? null,
            resolutionSlaHours: (e.resolutionSlaHours as Record<string, number> | null) ?? null,
            slaEscalationHours: e.slaEscalationHours,
          })
        }
      }

      const toAtRiskIds: string[] = []
      const toBreachedIds: string[] = []
      const candidateLogs: Array<{
        reportId: string
        entityId: string
        milestone: 'AT_RISK_75' | 'BREACHED' | 'ESCALATED'
        dedupKey: string
        title: string
        category: Category
        status: ReportStatus
        slaDueAt: Date
        hoursOverdue: number
      }> = []

      for (const r of batch) {
        const entityId = r.recipientId!
        const policy = entityCache.get(entityId) ?? {
          id: entityId,
          legalName: 'Entidade',
          slaHours: null,
          resolutionSlaHours: null,
          slaEscalationHours: DEFAULT_SLA_ESCALATION_HOURS,
        }

        const effectivePolicy = {
          slaHours:
            r.slaDueAt && r.slaStartedAt
              ? {
                  [r.category]: Math.max(
                    1,
                    Math.round((r.slaDueAt.getTime() - r.slaStartedAt.getTime()) / 3_600_000),
                  ),
                }
              : policy.slaHours,
          resolutionSlaHours:
            r.resolutionSlaDueAt && r.slaStartedAt
              ? {
                  [r.category]: Math.max(
                    1,
                    Math.round((r.resolutionSlaDueAt.getTime() - r.slaStartedAt.getTime()) / 3_600_000),
                  ),
                }
              : policy.resolutionSlaHours,
          escalationHours: policy.slaEscalationHours,
        }

        const computed = computeSla(
          {
            category: r.category as unknown as SharedCategory,
            status: r.status,
            createdAt: r.createdAt,
            firstResponseAt: r.firstResponseAt,
            resolvedAt: r.resolvedAt,
            slaStartedAt: r.slaStartedAt ?? r.createdAt,
            slaState: (r.slaState as any) ?? null,
          },
          effectivePolicy,
          now,
        )

        const cycleIso = (r.slaDueAt ?? computed.slaDueAt).toISOString()

        if (computed.slaState === 'AT_RISK' && r.slaState !== SlaState.AT_RISK) {
          toAtRiskIds.push(r.id)
          candidateLogs.push({
            reportId: r.id,
            entityId,
            milestone: 'AT_RISK_75',
            dedupKey: `sla:${r.id}:${cycleIso}:AT_RISK_75`,
            title: r.title,
            category: r.category,
            status: r.status,
            slaDueAt: computed.slaDueAt,
            hoursOverdue: 0,
          })
        } else if (computed.slaState === 'BREACHED') {
          if (r.slaState !== SlaState.BREACHED) {
            toBreachedIds.push(r.id)
          }
          candidateLogs.push({
            reportId: r.id,
            entityId,
            milestone: 'BREACHED',
            dedupKey: `sla:${r.id}:${cycleIso}:BREACHED`,
            title: r.title,
            category: r.category,
            status: r.status,
            slaDueAt: computed.slaDueAt,
            hoursOverdue: computed.hoursOverdue,
          })
          if (computed.shouldEscalate) {
            candidateLogs.push({
              reportId: r.id,
              entityId,
              milestone: 'ESCALATED',
              dedupKey: `sla:${r.id}:${cycleIso}:ESCALATED`,
              title: r.title,
              category: r.category,
              status: r.status,
              slaDueAt: computed.slaDueAt,
              hoursOverdue: computed.hoursOverdue,
            })
          }
        }
      }

      if (toAtRiskIds.length > 0) {
        await this.prisma.report.updateMany({
          where: { id: { in: toAtRiskIds } },
          data: { slaState: SlaState.AT_RISK },
        })
        transitionedAtRisk += toAtRiskIds.length
      }

      if (toBreachedIds.length > 0) {
        await this.prisma.report.updateMany({
          where: { id: { in: toBreachedIds } },
          data: { slaState: SlaState.BREACHED },
        })
        transitionedBreached += toBreachedIds.length
      }

      if (candidateLogs.length > 0) {
        const existingLogs = await this.prisma.slaNotificationLog.findMany({
          where: { dedupKey: { in: candidateLogs.map((c) => c.dedupKey) } },
          select: { dedupKey: true },
        })
        const alreadySentSet = new Set(existingLogs.map((l) => l.dedupKey))
        const freshEvents = candidateLogs.filter((c) => !alreadySentSet.has(c.dedupKey))

        if (freshEvents.length > 0) {
          await this.prisma.slaNotificationLog.createMany({
            data: freshEvents.map((e) => ({
              reportId: e.reportId,
              entityId: e.entityId,
              milestone: e.milestone,
              dedupKey: e.dedupKey,
            })),
            skipDuplicates: true,
          })

          // Busca membros ativos e atribuições apenas para as entidades com eventos novos
          const affectedEntityIds = Array.from(new Set(freshEvents.map((e) => e.entityId)))
          const affectedReportIds = Array.from(new Set(freshEvents.map((e) => e.reportId)))

          const [memberships, activeAssignments] = await Promise.all([
            this.prisma.orgMembership.findMany({
              where: {
                orgType: OrgType.ENTITY,
                orgId: { in: affectedEntityIds },
                status: MembershipStatus.ACTIVE,
              },
              select: {
                orgId: true,
                userId: true,
                role: { select: { name: true, permissions: true } },
              },
            }),
            this.prisma.orgReportAssignment.findMany({
              where: {
                orgType: OrgType.ENTITY,
                orgId: { in: affectedEntityIds },
                reportId: { in: affectedReportIds },
                active: true,
                assigneeUserId: { not: null },
              },
              select: { reportId: true, assigneeUserId: true },
            }),
          ])

          const assigneeByReport = new Map(
            activeAssignments.map((a) => [a.reportId, a.assigneeUserId!]),
          )

          for (const ev of freshEvents) {
            const entityMeta = entityCache.get(ev.entityId)
            const digest = digestPerEntity.get(ev.entityId) ?? {
              orgName: entityMeta?.legalName ?? 'Entidade',
              atRiskCount: 0,
              breachedCount: 0,
              escalatedCount: 0,
              highlights: [],
            }

            if (ev.milestone === 'AT_RISK_75') digest.atRiskCount++
            if (ev.milestone === 'BREACHED') digest.breachedCount++
            if (ev.milestone === 'ESCALATED') digest.escalatedCount++
            if (digest.highlights.length < 10) {
              digest.highlights.push({
                reportId: ev.reportId,
                title: ev.title,
                category: ev.category,
                stageLabel:
                  ev.milestone === 'ESCALATED'
                    ? 'Escalonado à gestão'
                    : ev.milestone === 'BREACHED'
                      ? 'Prazo vencido'
                      : 'Em risco (75%)',
              })
            }
            digestPerEntity.set(ev.entityId, digest)

            if (ev.milestone === 'BREACHED') {
              await this.timeline.record({
                reportId: ev.reportId,
                type: SharedEventType.UPDATE,
                content: 'Prazo de primeira resposta vencido.',
                authorId: null,
                metadata: { action: 'sla_breached', kind: 'sla_event' },
              })
              this.webhooks
                ?.enqueueEvent(
                  OrgType.ENTITY,
                  ev.entityId,
                  WebhookEventType.SLA_BREACHED,
                  ev.dedupKey,
                  {
                    reportId: ev.reportId,
                    category: ev.category,
                    status: ev.status,
                    slaDueAt: ev.slaDueAt.toISOString(),
                  },
                )
                .catch(() => null)
            } else if (ev.milestone === 'AT_RISK_75') {
              this.webhooks
                ?.enqueueEvent(
                  OrgType.ENTITY,
                  ev.entityId,
                  WebhookEventType.SLA_AT_RISK,
                  ev.dedupKey,
                  {
                    reportId: ev.reportId,
                    category: ev.category,
                    status: ev.status,
                    slaDueAt: ev.slaDueAt.toISOString(),
                  },
                )
                .catch(() => null)
            }

            const orgMembers = memberships.filter((m) => m.orgId === ev.entityId)
            const assignedUserId = assigneeByReport.get(ev.reportId)
            const targetUserIds = new Set<string>()

            if (ev.milestone === 'ESCALATED') {
              for (const m of orgMembers) {
                if (
                  m.role.name === 'Proprietário' ||
                  m.role.name === 'Gestor' ||
                  m.role.permissions.includes(OrgPermission.MANAGE_PROFILE) ||
                  m.role.permissions.includes(OrgPermission.ASSIGN_REPORTS)
                ) {
                  targetUserIds.add(m.userId)
                }
              }
              escalationsSent += targetUserIds.size > 0 ? 1 : 0
            } else if (assignedUserId) {
              targetUserIds.add(assignedUserId)
            } else {
              for (const m of orgMembers) {
                if (m.role.permissions.includes(OrgPermission.RESPOND_REPORTS)) {
                  targetUserIds.add(m.userId)
                }
              }
            }

            const notifType =
              ev.milestone === 'ESCALATED'
                ? NotificationType.SLA_ESCALATED
                : ev.milestone === 'BREACHED'
                  ? NotificationType.SLA_BREACHED
                  : NotificationType.SLA_AT_RISK

            for (const uid of targetUserIds) {
              await this.notifications.notify({
                userId: uid,
                type: notifType,
                reportId: ev.reportId,
                metadata: {
                  entityId: ev.entityId,
                  milestone: ev.milestone,
                  category: ev.category,
                  hoursOverdue: ev.hoursOverdue,
                },
              })
              notificationsSent++
            }
          }
        }
      }
    }

    // E-mail agrupado (1 e-mail resumo por entidade com alertas nesta janela)
    if (digestPerEntity.size > 0) {
      const entityIds = Array.from(digestPerEntity.keys())
      const recipients = await this.prisma.orgMembership.findMany({
        where: {
          orgType: OrgType.ENTITY,
          orgId: { in: entityIds },
          status: MembershipStatus.ACTIVE,
        },
        select: {
          orgId: true,
          role: { select: { name: true, permissions: true } },
          user: { select: { email: true, name: true } },
        },
      })

      for (const [entityId, summary] of digestPerEntity.entries()) {
        const entityRecipients = recipients.filter((r) => {
          if (r.orgId !== entityId || !r.user?.email) return false
          if (summary.escalatedCount > 0) {
            return (
              r.role.name === 'Proprietário' ||
              r.role.name === 'Gestor' ||
              r.role.permissions.includes(OrgPermission.MANAGE_PROFILE) ||
              r.role.permissions.includes(OrgPermission.ASSIGN_REPORTS)
            )
          }
          return r.role.permissions.includes(OrgPermission.RESPOND_REPORTS)
        })

        for (const rec of entityRecipients) {
          await this.mail.sendSlaAlertDigest(rec.user.email, rec.user.name, summary)
        }
      }
    }

    this.logger.log(
      `[sla-sweep] scanned=${scanned} atRisk=${transitionedAtRisk} breached=${transitionedBreached} notif=${notificationsSent} escalated=${escalationsSent}`,
    )

    return {
      scanned,
      transitionedAtRisk,
      transitionedBreached,
      notificationsSent,
      escalationsSent,
    }
  }

  private startOfSaoPauloDay(date: Date): Date {
    const dayStr = toSaoPauloDateKey(date)
    return new Date(`${dayStr}T03:00:00.000Z`)
  }
}
