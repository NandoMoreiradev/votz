import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  Category,
  OrgPermission,
  OrgType,
  RecipientType,
  ReportStatus,
  SlaState,
  UserType,
} from '@prisma/client'
import { Category as SharedCategory, computeSla, formatSlaQueueLabel } from '@votz/shared-types'
import { buildRatio } from '../analytics/analytics.constants'
import { ReportsRepository } from '../reports/reports.repository'
import { SlaService } from './sla.service'

function makeActingUser(overrides?: Partial<{ id: string; ctxOrgId: string; permissions: OrgPermission[] }>) {
  return {
    id: overrides?.id ?? 'user-gestor',
    email: 'gestor@entidade.gov.br',
    type: UserType.CITIZEN,
    ctx: {
      type: 'ENTITY' as const,
      id: overrides?.ctxOrgId ?? 'ent-1',
      name: 'Prefeitura Teste',
      logoUrl: null,
      permissions: overrides?.permissions ?? [
        OrgPermission.VIEW_ANALYTICS,
        OrgPermission.ASSIGN_REPORTS,
        OrgPermission.MANAGE_PROFILE,
      ],
    },
  }
}

describe('SlaService — Watcher, Deduplication, Authorization, Privacy & Reconciliation', () => {
  it('idempotently sweeps open reports, deduplicates alerts via SlaNotificationLog, escalates managers and posts timeline without staff names', async () => {
    const sentLogs = new Set<string>()
    const notifyCalls: unknown[] = []
    const timelineCalls: Array<{ reportId: string; content: string; authorId?: string | null }> = []
    const digestMails: Array<{ email: string; breachedCount: number; escalatedCount: number }> = []
    const webhooksEnqueued: Array<{ eventType: string; data: Record<string, unknown> }> = []

    const startedAt = new Date('2026-11-01T00:00:00.000Z')
    const dueAt = new Date('2026-11-02T00:00:00.000Z')
    let sweepCall = 0

    const prisma = {
      report: {
        findMany: jest.fn(async ({ cursor }: { cursor?: { id: string } }) => {
          sweepCall++
          if (cursor) return []
          return [
            {
              id: 'rep-breached',
              title: 'Buraco na av. central',
              category: Category.INFRASTRUCTURE,
              status: ReportStatus.OPEN,
              recipientId: 'ent-1',
              createdAt: startedAt,
              firstResponseAt: null,
              resolvedAt: null,
              slaStartedAt: startedAt,
              slaDueAt: dueAt,
              slaState: SlaState.AT_RISK,
              resolutionSlaDueAt: null,
              resolutionSlaState: null,
            },
          ]
        }),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      entity: {
        findMany: jest.fn(async () => [
          {
            id: 'ent-1',
            legalName: 'Prefeitura Teste',
            slaHours: { INFRASTRUCTURE: 24 },
            resolutionSlaHours: null,
            slaEscalationHours: 12,
          },
        ]),
      },
      slaNotificationLog: {
        findMany: jest.fn(async ({ where }: { where: { dedupKey: { in: string[] } } }) =>
          where.dedupKey.in.filter((k) => sentLogs.has(k)).map((dedupKey) => ({ dedupKey })),
        ),
        createMany: jest.fn(async ({ data }: { data: Array<{ dedupKey: string }> }) => {
          for (const d of data) sentLogs.add(d.dedupKey)
          return { count: data.length }
        }),
      },
      orgMembership: {
        findMany: jest.fn(async () => [
          {
            orgId: 'ent-1',
            userId: 'user-gestor',
            role: { name: 'Gestor', permissions: [OrgPermission.MANAGE_PROFILE, OrgPermission.ASSIGN_REPORTS] },
            user: { email: 'gestor@entidade.gov.br', name: 'Carlos Gestor' },
          },
        ]),
      },
      orgReportAssignment: {
        findMany: jest.fn(async () => []),
      },
    }

    const service = new SlaService(
      prisma as any,
      {} as any,
      { notify: jest.fn(async (p) => notifyCalls.push(p)) } as any,
      { record: jest.fn(async (p) => timelineCalls.push(p)) } as any,
      {
        sendSlaAlertDigest: jest.fn(async (email, _name, data) =>
          digestMails.push({ email, breachedCount: data.breachedCount, escalatedCount: data.escalatedCount }),
        ),
      } as any,
      {
        enqueueEvent: jest.fn(async (_t, _id, eventType, _eid, data) => {
          webhooksEnqueued.push({ eventType, data })
        }),
      } as any,
    )

    // 13h after due -> BREACHED + ESCALATED (>12h)
    const now = new Date('2026-11-02T13:00:00.000Z')
    const first = await service.runSlaSweep(now, 500)
    expect(first.scanned).toBe(1)
    expect(first.transitionedBreached).toBe(1)
    expect(first.escalationsSent).toBe(1)
    expect(timelineCalls).toHaveLength(1)
    expect(timelineCalls[0].authorId).toBeNull()
    expect(timelineCalls[0].content).toBe('Prazo de primeira resposta vencido.')
    expect(timelineCalls[0].content).not.toContain('Carlos')
    expect(digestMails).toHaveLength(1)
    expect(webhooksEnqueued.some((w) => w.eventType === 'SLA_BREACHED')).toBe(true)

    // Re-running sweep at same timestamp deduplicates everything cleanly
    const second = await service.runSlaSweep(now, 500)
    expect(second.notificationsSent).toBe(0)
    expect(second.escalationsSent).toBe(0)
    expect(timelineCalls).toHaveLength(1)
    expect(digestMails).toHaveLength(1)
  })

  it('processes 10,000 open reports cleanly across cursor batches without timing out', async () => {
    const startedAt = new Date('2026-11-01T00:00:00.000Z')
    const dueAt = new Date('2026-11-03T00:00:00.000Z') // +48h window
    const now = new Date('2026-11-01T12:00:00.000Z') // all ON_TIME -> fast path

    const allReports = Array.from({ length: 10_000 }, (_, i) => ({
      id: `rep-${String(i).padStart(5, '0')}`,
      title: `Relato ${i}`,
      category: Category.URBAN_SERVICES,
      status: ReportStatus.OPEN,
      recipientId: 'ent-1',
      createdAt: startedAt,
      firstResponseAt: null,
      resolvedAt: null,
      slaStartedAt: startedAt,
      slaDueAt: dueAt,
      slaState: SlaState.ON_TIME,
      resolutionSlaDueAt: null,
      resolutionSlaState: null,
    }))

    const prisma = {
      report: {
        findMany: jest.fn(async ({ take, cursor }: { take: number; cursor?: { id: string } }) => {
          const startIdx = cursor ? allReports.findIndex((r) => r.id === cursor.id) + 1 : 0
          return allReports.slice(startIdx, startIdx + take)
        }),
      },
      entity: {
        findMany: jest.fn(async () => [
          {
            id: 'ent-1',
            legalName: 'Prefeitura 10k',
            slaHours: { URBAN_SERVICES: 48 },
            resolutionSlaHours: null,
            slaEscalationHours: 24,
          },
        ]),
      },
    }

    const service = new SlaService(
      prisma as any,
      {} as any,
      { notify: jest.fn() } as any,
      { record: jest.fn() } as any,
      { sendSlaAlertDigest: jest.fn() } as any,
    )

    const t0 = Date.now()
    const res = await service.runSlaSweep(now, 500)
    const elapsedMs = Date.now() - t0

    expect(res.scanned).toBe(10_000)
    expect(prisma.report.findMany).toHaveBeenCalledTimes(21) // 20 x 500 + 1 empty cursor break
    expect(elapsedMs).toBeLessThan(3000)
  })

  it('rejects assigning to inactive/outside members, missing ASSIGN_REPORTS, and cross-tenant report IDOR', async () => {
    const prisma = {
      orgMembership: {
        findUnique: jest.fn(async ({ where }: any) => {
          const k = where.userId_orgType_orgId
          if (k.userId === 'user-viewer' && k.orgId === 'ent-1') {
            return { status: 'ACTIVE', role: { permissions: [OrgPermission.VIEW_ANALYTICS] } }
          }
          if (k.userId === 'user-gestor' && k.orgId === 'ent-1') {
            return {
              status: 'ACTIVE',
              role: { permissions: [OrgPermission.ASSIGN_REPORTS, OrgPermission.VIEW_ANALYTICS] },
            }
          }
          if (k.userId === 'user-suspended' && k.orgId === 'ent-1') {
            return { status: 'SUSPENDED', user: { name: 'Inativo' } }
          }
          return null // outside org
        }),
      },
      report: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.id === 'rep-of-ent-1') {
            return {
              id: 'rep-of-ent-1',
              title: 'Poste queimado',
              category: Category.URBAN_SERVICES,
              status: ReportStatus.OPEN,
              recipientType: RecipientType.ENTITY,
              recipientId: 'ent-1',
              slaDueAt: new Date(),
            }
          }
          if (where.id === 'rep-of-ent-2') {
            return {
              id: 'rep-of-ent-2',
              title: 'Buraco em outra entidade',
              category: Category.URBAN_SERVICES,
              status: ReportStatus.OPEN,
              recipientType: RecipientType.ENTITY,
              recipientId: 'ent-2',
              slaDueAt: new Date(),
            }
          }
          return null
        }),
      },
    }

    const service = new SlaService(
      prisma as any,
      {} as any,
      { notify: jest.fn() } as any,
      { record: jest.fn() } as any,
      { sendSlaAlertDigest: jest.fn() } as any,
    )

    // 1. User without ASSIGN_REPORTS cannot assign
    await expect(
      service.assignReport(
        makeActingUser({ id: 'user-viewer', permissions: [OrgPermission.VIEW_ANALYTICS] }),
        'rep-of-ent-1',
        { assigneeUserId: 'user-target' },
      ),
    ).rejects.toThrow(ForbiddenException)

    // 2. Report from ent-2 accessed by ent-1 -> ForbiddenException (cross-tenant IDOR blocked)
    await expect(
      service.assignReport(makeActingUser({ ctxOrgId: 'ent-1' }), 'rep-of-ent-2', {
        assigneeUserId: 'user-target',
      }),
    ).rejects.toThrow(ForbiddenException)

    // 3. Target user outside organization -> BadRequestException
    await expect(
      service.assignReport(makeActingUser({ ctxOrgId: 'ent-1' }), 'rep-of-ent-1', {
        assigneeUserId: 'user-outside',
      }),
    ).rejects.toThrow(BadRequestException)

    // 4. Target user inactive (SUSPENDED) -> BadRequestException
    await expect(
      service.assignReport(makeActingUser({ ctxOrgId: 'ent-1' }), 'rep-of-ent-1', {
        assigneeUserId: 'user-suspended',
      }),
    ).rejects.toThrow(BadRequestException)

    // 5. Missing report -> NotFoundException
    await expect(
      service.assignReport(makeActingUser({ ctxOrgId: 'ent-1' }), 'rep-missing', {
        assigneeUserId: 'user-gestor',
      }),
    ).rejects.toThrow(NotFoundException)
  })

  it('reconciles public SLA compliance rate identically against rollup and raw SlaState counts', async () => {
    const reports = Array.from({ length: 12 }, (_, idx) => ({
      category: SharedCategory.HEALTH,
      status: idx < 9 ? ReportStatus.RESOLVED : ReportStatus.OPEN,
      createdAt: new Date('2026-11-01T12:00:00.000Z'),
      slaStartedAt: new Date('2026-11-01T12:00:00.000Z'),
      firstResponseAt:
        idx < 9
          ? new Date(idx < 6 ? '2026-11-02T00:00:00.000Z' : '2026-11-03T12:00:00.000Z')
          : null,
    }))
    // Now = 2026-11-05 (after 24h SLA -> remaining 3 open are BREACHED)
    const now = new Date('2026-11-05T00:00:00.000Z')
    const rawStates = reports.map(
      (r) =>
        computeSla(r, { slaHours: { HEALTH: 24 }, escalationHours: 12 }, now).slaState,
    )
    const rawMet = rawStates.filter((s) => s === 'MET').length // 6
    const rawBreached = rawStates.filter((s) => s === 'BREACHED' || s === 'MET_LATE').length // 3 + 3 = 6
    const rawRate = buildRatio(rawMet, rawMet + rawBreached, 100)

    const prisma = {
      orgMembership: {
        findUnique: jest.fn(async () => ({
          status: 'ACTIVE',
          role: { permissions: [OrgPermission.VIEW_ANALYTICS] },
        })),
      },
      entity: {
        findUnique: jest.fn(async () => ({
          slaHours: { HEALTH: 24 },
          resolutionSlaHours: null,
          slaEscalationHours: 12,
        })),
      },
    }

    const analyticsRepo = {
      fetchDirectedSummary: jest.fn(async () => ({
        createdCount: 12,
        resolvedCount: 9,
        openCurrentCount: 3,
        openOver7dCount: 0,
        contestedCount: 0,
        responseCount: 9,
        resolutionDurationCount: 9,
        supportCount: 0,
        commentCount: 0,
        slaMetCount: rawMet,
        slaBreachedCount: rawBreached,
        pressureSum: 100,
        respBuckets: [6, 0, 3, 0, 0, 0, 0, 0],
        resBuckets: [0, 0, 0, 0, 0, 0, 0, 0],
        pressureBuckets: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      })),
      fetchCategoryBreakdown: jest.fn(async () => [
        {
          category: Category.HEALTH,
          createdCount: 12,
          resolvedCount: 9,
          openCurrentCount: 3,
          openOver7dCount: 0,
          contestedCount: 0,
          responseCount: 9,
          resolutionDurationCount: 9,
          supportCount: 0,
          commentCount: 0,
          slaMetCount: rawMet,
          slaBreachedCount: rawBreached,
          pressureSum: 100,
          respBuckets: [6, 0, 3, 0, 0, 0, 0, 0],
          resBuckets: [0, 0, 0, 0, 0, 0, 0, 0],
        },
      ]),
      fetchDailySeries: jest.fn(async () => []),
    }

    const service = new SlaService(
      prisma as any,
      analyticsRepo as any,
      { notify: jest.fn() } as any,
      { record: jest.fn() } as any,
      { sendSlaAlertDigest: jest.fn() } as any,
    )

    const perf = await service.getPerformance(makeActingUser(), {}, now)
    expect(perf.summary.slaMet).toBe(6)
    expect(perf.summary.slaBreached).toBe(6)
    expect(perf.summary.complianceRate).toEqual(rawRate)
    expect(perf.summary.complianceRate.value).toBe(50)
    expect(perf.hasOwnSla).toBe(true)
    expect(perf.byCategory[0].isDefaultPolicy).toBe(false)

    // Sem política própria em Entity.slaHours: rollups internos continuam calculando, mas sinalizam prazo padrão (hasOwnSla: false / isDefaultPolicy: true)
    ;(prisma.entity.findUnique as jest.Mock).mockResolvedValueOnce({
      slaHours: null,
      resolutionSlaHours: null,
      slaEscalationHours: 24,
    })
    const perfDefault = await service.getPerformance(makeActingUser(), {}, now)
    expect(perfDefault.summary.complianceRate.value).toBe(50)
    expect(perfDefault.hasOwnSla).toBe(false)
    expect(perfDefault.byCategory[0].isDefaultPolicy).toBe(true)
  })

  it('G1/F5: listQueue uses mutually exclusive buckets summing to totalOpen, handles DISPUTED/MET/MET_LATE/noSla, and never exposes negative hours', async () => {
    const now = new Date('2026-11-16T15:00:00.000Z') // 12:00BRT
    const h = (deltaHours: number) => new Date(now.getTime() + deltaHours * 3_600_000)

    const fixtures = [
      {
        id: 'rep-breached',
        title: 'Buraco na av. central',
        category: Category.INFRASTRUCTURE,
        status: ReportStatus.OPEN,
        neighborhood: 'Centro',
        city: 'Aracaju',
        state: 'SE',
        pressureScore: 10,
        createdAt: h(-84),
        firstResponseAt: null,
        slaStartedAt: h(-84),
        slaDueAt: h(-12),
        slaState: SlaState.BREACHED,
        slaMetAt: null,
        resolutionSlaDueAt: null,
        resolutionSlaState: null,
        assignments: [],
      },
      {
        id: 'rep-disputed-met',
        title: 'Calçada contestada',
        category: Category.INFRASTRUCTURE,
        status: ReportStatus.DISPUTED,
        neighborhood: 'Centro',
        city: 'Aracaju',
        state: 'SE',
        pressureScore: 8,
        createdAt: h(-132),
        firstResponseAt: h(-65),
        slaStartedAt: h(-132),
        slaDueAt: h(-60),
        slaState: SlaState.MET,
        slaMetAt: h(-65),
        resolutionSlaDueAt: null,
        resolutionSlaState: null,
        assignments: [{ id: 'a-1', orgType: OrgType.ENTITY, orgId: 'ent-1', active: true, assigneeUserId: 'user-gestor', createdAt: h(-100), note: null }],
      },
      {
        id: 'rep-in-progress-met-late',
        title: 'Esgoto respondido com atraso',
        category: Category.SANITATION,
        status: ReportStatus.IN_PROGRESS,
        neighborhood: 'Atalaia',
        city: 'Aracaju',
        state: 'SE',
        pressureScore: 12,
        createdAt: h(-1800),
        firstResponseAt: h(-1738.2),
        slaStartedAt: h(-1800),
        slaDueAt: h(-1741.7),
        slaState: SlaState.MET_LATE,
        slaMetAt: h(-1738.2),
        resolutionSlaDueAt: null,
        resolutionSlaState: null,
        assignments: [],
      },
      {
        id: 'rep-under-review-met',
        title: 'Semáforo respondido no prazo',
        category: Category.MOBILITY,
        status: ReportStatus.UNDER_REVIEW,
        neighborhood: 'Farolândia',
        city: 'Aracaju',
        state: 'SE',
        pressureScore: 6,
        createdAt: h(-58),
        firstResponseAt: h(-20),
        slaStartedAt: h(-58),
        slaDueAt: h(-10),
        slaState: SlaState.MET,
        slaMetAt: h(-20),
        resolutionSlaDueAt: null,
        resolutionSlaState: null,
        assignments: [],
      },
      {
        id: 'rep-at-risk-due-today',
        title: 'Poste apagado vence hoje',
        category: Category.URBAN_SERVICES,
        status: ReportStatus.OPEN,
        neighborhood: 'Luzia',
        city: 'Aracaju',
        state: 'SE',
        pressureScore: 7,
        createdAt: h(-67),
        firstResponseAt: null,
        slaStartedAt: h(-67),
        slaDueAt: h(5),
        slaState: SlaState.AT_RISK,
        slaMetAt: null,
        resolutionSlaDueAt: null,
        resolutionSlaState: null,
        assignments: [],
      },
      {
        id: 'rep-on-time',
        title: 'Coleta de lixo em andamento normal',
        category: Category.SANITATION,
        status: ReportStatus.OPEN,
        neighborhood: 'Jardins',
        city: 'Aracaju',
        state: 'SE',
        pressureScore: 4,
        createdAt: h(-28),
        firstResponseAt: null,
        slaStartedAt: h(-28),
        slaDueAt: h(20),
        slaState: SlaState.ON_TIME,
        slaMetAt: null,
        resolutionSlaDueAt: null,
        resolutionSlaState: null,
        assignments: [{ id: 'a-2', orgType: OrgType.ENTITY, orgId: 'ent-1', active: true, assigneeUserId: 'user-gestor', createdAt: h(-20), note: null }],
      },
      {
        id: 'rep-no-sla',
        title: 'Relato legado sem prazo',
        category: Category.OTHER,
        status: ReportStatus.OPEN,
        neighborhood: 'Centro',
        city: 'Aracaju',
        state: 'SE',
        pressureScore: 2,
        createdAt: h(-200),
        firstResponseAt: null,
        slaStartedAt: null,
        slaDueAt: null,
        slaState: null,
        slaMetAt: null,
        resolutionSlaDueAt: null,
        resolutionSlaState: null,
        assignments: [],
      },
      {
        id: 'rep-resolved-excluded',
        title: 'Já resolvido',
        category: Category.OTHER,
        status: ReportStatus.RESOLVED,
        neighborhood: 'Centro',
        city: 'Aracaju',
        state: 'SE',
        pressureScore: 5,
        createdAt: h(-100),
        firstResponseAt: h(-90),
        slaStartedAt: h(-100),
        slaDueAt: h(-50),
        slaState: SlaState.MET,
        slaMetAt: h(-90),
        resolutionSlaDueAt: null,
        resolutionSlaState: null,
        assignments: [],
      },
    ]

    const matchesWhere = (row: (typeof fixtures)[number], where: any): boolean => {
      if (where.status?.in && !where.status.in.includes(row.status)) return false
      if (where.OR) {
        if (!where.OR.some((clause: any) => matchesWhere(row, clause))) return false
      }
      if (where.slaDueAt) {
        if (where.slaDueAt.not === null && row.slaDueAt === null) return false
        if (where.slaDueAt.gte && (!row.slaDueAt || row.slaDueAt < where.slaDueAt.gte)) return false
        if (where.slaDueAt.lte && (!row.slaDueAt || row.slaDueAt > where.slaDueAt.lte)) return false
      }
      if ('slaDueAt' in where && where.slaDueAt === null && row.slaDueAt !== null) return false
      if ('slaState' in where) {
        if (where.slaState === null && row.slaState !== null) return false
        if (typeof where.slaState === 'string' && row.slaState !== where.slaState) return false
        if (where.slaState?.in && !where.slaState.in.includes(row.slaState)) return false
      }
      if (where.assignments?.none && row.assignments.length > 0) return false
      if (where.assignments?.some) {
        const uid = where.assignments.some.assigneeUserId
        if (!row.assignments.some((a) => a.assigneeUserId === uid)) return false
      }
      return true
    }

    const prisma = {
      orgMembership: {
        findUnique: jest.fn(async () => ({
          status: 'ACTIVE',
          role: { permissions: [OrgPermission.VIEW_ANALYTICS] },
        })),
      },
      report: {
        count: jest.fn(async ({ where }: any) => fixtures.filter((r) => matchesWhere(r, where)).length),
        findMany: jest.fn(async ({ where }: any) => fixtures.filter((r) => matchesWhere(r, where))),
      },
      user: { findMany: jest.fn(async () => [{ id: 'user-gestor', name: 'Gestor', avatarUrl: null }]) },
    }
    const service = new SlaService(
      prisma as any,
      {} as any,
      { notify: jest.fn() } as any,
      { record: jest.fn() } as any,
      { sendSlaAlertDigest: jest.fn() } as any,
    )

    const queue = await service.listQueue(makeActingUser(), {}, now)
    expect(queue.summary).toEqual({
      totalOpen: 7,
      breached: 1,
      dueToday: 1,
      atRisk: 1,
      onTime: 1,
      responded: 3,
      respondedOnTime: 2,
      respondedLate: 1,
      noSla: 1,
      unassigned: 5,
      mine: 2,
    })

    // Soma dos 5 estados exclusivos === Todos, e Meus + Não atribuídos === Todos
    expect(
      queue.summary.breached +
        queue.summary.atRisk +
        queue.summary.onTime +
        queue.summary.responded +
        queue.summary.noSla,
    ).toBe(queue.summary.totalOpen)
    expect(queue.summary.mine + queue.summary.unassigned).toBe(queue.summary.totalOpen)

    // Todos os itens formatam rótulo sem horas negativas nem "resta" para respondidos
    const labelsById = new Map(queue.items.map((item) => [item.id, formatSlaQueueLabel(item)]))
    expect(labelsById.get('rep-breached')).toBe('Vencido há 12 h')
    expect(labelsById.get('rep-disputed-met')).toBe('Respondido no prazo')
    expect(labelsById.get('rep-in-progress-met-late')).toBe('Respondido fora do prazo (+3,5 h)')
    expect(labelsById.get('rep-under-review-met')).toBe('Respondido no prazo')
    expect(labelsById.get('rep-at-risk-due-today')).toBe('Em risco · Vence hoje · Resta 5 h')
    expect(labelsById.get('rep-on-time')).toBe('Resta 20 h')
    expect(labelsById.get('rep-no-sla')).toBe('Sem prazo definido')

    for (const item of queue.items) {
      expect(formatSlaQueueLabel(item)).not.toMatch(/-\d/)
      if (item.hoursRemaining !== null) expect(item.hoursRemaining).toBeGreaterThanOrEqual(0)
      if (item.hoursOverdue !== null) expect(item.hoursOverdue).toBeGreaterThanOrEqual(0)
      if (item.hoursLate !== null) expect(item.hoursLate).toBeGreaterThanOrEqual(0)
    }

    // Filtro RESPONDED retorna apenas MET + MET_LATE (inclusive em DISPUTED/IN_PROGRESS/UNDER_REVIEW)
    const respondedOnly = await service.listQueue(makeActingUser(), { urgency: 'RESPONDED' }, now)
    expect(respondedOnly.items.map((i) => i.id)).toEqual([
      'rep-disputed-met',
      'rep-in-progress-met-late',
      'rep-under-review-met',
    ])
  })

  it('F5: ReportsRepository.create populates slaDueAt, slaStartedAt and slaState for every new report directed to an entity', async () => {
    const capturedData: Array<Record<string, unknown>> = []
    const prisma = {
      entity: {
        findUnique: jest.fn(async () => ({
          slaHours: null,
          resolutionSlaHours: null,
          slaEscalationHours: 24,
        })),
      },
      report: {
        create: jest.fn(async ({ data }: any) => {
          capturedData.push(data)
          return { id: 'rep-new-1', ...data }
        }),
      },
    }
    const repo = new ReportsRepository(prisma as any)
    await repo.create(
      {
        title: 'Buraco na rua',
        description: 'Via danificada',
        category: Category.INFRASTRUCTURE as any,
        latitude: -10.9472,
        longitude: -37.0731,
        city: 'Aracaju',
        state: 'SE',
        neighborhood: 'Centro',
        recipientType: RecipientType.ENTITY as any,
        recipientId: 'ent-1',
      },
      'author-1',
    )

    expect(capturedData[0].slaStartedAt).toBeInstanceOf(Date)
    expect(capturedData[0].slaDueAt).toBeInstanceOf(Date)
    expect(capturedData[0].slaState).toBe(SlaState.ON_TIME)
  })
})
