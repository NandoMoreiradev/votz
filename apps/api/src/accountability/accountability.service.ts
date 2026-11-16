import { InjectQueue } from '@nestjs/bullmq'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AccountabilityReportStatus,
  EventType,
  MembershipStatus,
  OrgPermission,
  OrgType,
  Prisma,
  RecipientType,
  ReportStatus,
} from '@prisma/client'
import {
  ANALYTICS_DEFINITION_DATE,
  ANALYTICS_DEFINITION_VERSION,
  ANALYTICS_TIMEZONE,
  MIN_CELL_SIZE,
  RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
  computePercentileFromBuckets,
  getPlanConfig,
  hasFeature,
  normalizeLocationKey,
} from '@votz/shared-types'
import { Queue } from 'bullmq'
import { randomBytes } from 'crypto'
import {
  addDaysDateString,
  diffDaysBetweenStrings,
  toSaoPauloDateString,
} from '../analytics/analytics.constants'
import { AnalyticsRepository } from '../analytics/analytics.repository'
import { AnalyticsScopeService } from '../analytics/analytics.scope'
import { AnalyticsScopeMode } from '../analytics/dto/analytics-query.dto'
import { ActingUser } from '../auth/acting-org'
import { recordOrgAudit } from '../common/audit/org-audit'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { CreateAccountabilityReportDto } from './dto/accountability.dto'
import {
  AccountabilitySnapshot,
  ReportRendererService,
} from './report-renderer.service'

export const ACCOUNTABILITY_QUEUE = 'accountability'
export const ACCOUNTABILITY_EXPORT_TTL_DAYS = 7

@Injectable()
export class AccountabilityService {
  private readonly logger = new Logger(AccountabilityService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: AnalyticsScopeService,
    private readonly analyticsRepo: AnalyticsRepository,
    private readonly renderer: ReportRendererService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @InjectQueue(ACCOUNTABILITY_QUEUE) private readonly queue: Queue,
    @Optional() private readonly mail?: MailService,
  ) {}

  private buildPeriodTimestamps(fromStr: string, toStr: string) {
    const start = new Date(`${fromStr}T03:00:00.000Z`) // 00:00 America/Sao_Paulo
    const end = new Date(`${addDaysDateString(toStr, 1)}T02:59:59.999Z`) // 23:59:59.999 America/Sao_Paulo
    return { start, end }
  }

  async createReport(user: ActingUser, dto: CreateAccountabilityReportDto) {
    const fromStr = dto.from.slice(0, 10)
    const toStr = dto.to.slice(0, 10)
    const spanDays = diffDaysBetweenStrings(fromStr, toStr) + 1
    if (spanDays <= 0 || spanDays > 366) {
      throw new BadRequestException('Período deve estar entre 1 e 366 dias')
    }

    const scope = await this.scopeService.resolveOrgScope(
      user,
      { from: fromStr, to: toStr, scope: AnalyticsScopeMode.AREA },
      { forceTerritory: true },
    )

    const orgType = scope.orgType === 'POLITICIAN' ? OrgType.POLITICIAN : OrgType.ENTITY
    return this.buildAndQueueReportForOrg({
      orgType,
      orgId: scope.orgId,
      orgName: scope.orgName,
      state: scope.state,
      cityKey: scope.cityKey,
      plan: scope.plan,
      fromStr,
      toStr,
      actorId: user.id,
      notifyManagers: false,
    })
  }

  async runMonthlyEntityAutoReports(now = new Date()): Promise<{ scheduled: number }> {
    const todaySp = toSaoPauloDateString(now)
    const [yearStr, monthStr] = todaySp.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    const prevMonthDate = new Date(Date.UTC(year, month - 2, 1))
    const prevLastDayDate = new Date(Date.UTC(year, month - 1, 0))
    const fromStr = prevMonthDate.toISOString().slice(0, 10)
    const toStr = prevLastDayDate.toISOString().slice(0, 10)

    const entities = await this.prisma.entity.findMany({
      where: {
        autoMonthlyReportEnabled: true,
        state: { not: null },
      },
      select: {
        id: true,
        legalName: true,
        state: true,
        city: true,
        plan: true,
      },
    })

    let scheduled = 0
    for (const ent of entities) {
      if (!ent.state || !hasFeature('ENTITY', ent.plan, 'pdf_report')) continue
      const existing = await this.prisma.accountabilityReport.findFirst({
        where: {
          orgType: OrgType.ENTITY,
          orgId: ent.id,
          periodStart: fromStr,
          periodEnd: toStr,
        },
        select: { id: true },
      })
      if (existing) continue

      const cityKey = ent.city ? normalizeLocationKey(ent.city) : null
      try {
        await this.buildAndQueueReportForOrg({
          orgType: OrgType.ENTITY,
          orgId: ent.id,
          orgName: ent.legalName,
          state: ent.state,
          cityKey,
          plan: ent.plan,
          fromStr,
          toStr,
          actorId: null,
          notifyManagers: true,
        })
        scheduled++
      } catch (err) {
        this.logger.warn(
          `Falha ao gerar relatório mensal automático da entidade ${ent.id}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    return { scheduled }
  }

  private async buildAndQueueReportForOrg(params: {
    orgType: OrgType
    orgId: string
    orgName: string
    state: string
    cityKey: string | null
    plan: string
    fromStr: string
    toStr: string
    actorId: string | null
    notifyManagers: boolean
  }) {
    const { orgType, orgId, orgName, state, cityKey, plan, fromStr, toStr, actorId, notifyManagers } =
      params
    const spanDays = diffDaysBetweenStrings(fromStr, toStr) + 1
    const planScopeType = orgType === OrgType.POLITICIAN ? 'POLITICIAN' : 'ENTITY'
    const planCfg = getPlanConfig(planScopeType, plan)
    const monthlyLimit = planCfg?.limits.maxPdfReportsPerMonth ?? 0

    if (monthlyLimit !== null) {
      const todaySp = toSaoPauloDateString(new Date())
      const monthStart = new Date(`${todaySp.slice(0, 7)}-01T03:00:00.000Z`)
      const createdInMonth = await this.prisma.accountabilityReport.count({
        where: {
          orgType,
          orgId,
          createdAt: { gte: monthStart },
        },
      })
      if (createdInMonth >= monthlyLimit) {
        throw new ForbiddenException(
          `Limite mensal de ${monthlyLimit} relatórios de prestação de contas atingido para o plano atual.`,
        )
      }
    }

    const prevEnd = addDaysDateString(fromStr, -1)
    const prevStart = addDaysDateString(prevEnd, -(spanDays - 1))
    const todayStr = toSaoPauloDateString(new Date())
    const matureCutoff = addDaysDateString(todayStr, -7)

    const areaFilter = { state, cityKey, from: fromStr, to: toStr }
    const prevAreaFilter = { state, cityKey, from: prevStart, to: prevEnd }

    const [summary, prevSummary, categories, directedSummary, recurrenceWindow] = await Promise.all([
      this.analyticsRepo.fetchAreaSummary(areaFilter, matureCutoff),
      this.analyticsRepo.fetchAreaSummary(prevAreaFilter, matureCutoff),
      this.analyticsRepo.fetchCategoryBreakdown('area', areaFilter, null, matureCutoff),
      orgType === OrgType.ENTITY && typeof this.analyticsRepo.fetchDirectedSummary === 'function'
        ? this.analyticsRepo.fetchDirectedSummary(
            { recipientType: RecipientType.ENTITY, recipientId: orgId, from: fromStr, to: toStr },
            matureCutoff,
          )
        : Promise.resolve(null),
      orgType === OrgType.ENTITY && typeof this.analyticsRepo.fetchLatestRecurrenceWindow === 'function'
        ? this.analyticsRepo.fetchLatestRecurrenceWindow(state, cityKey)
        : Promise.resolve(null),
    ])

    const { start, end } = this.buildPeriodTimestamps(fromStr, toStr)

    let advocatedCount = 0
    let roleOrTypeLabel = 'Organização pública'
    let territoryLabel = `${state}`

    if (orgType === OrgType.POLITICIAN) {
      const pol = await this.prisma.politician.findUnique({
        where: { id: orgId },
        select: { office: true, city: true, state: true },
      })
      roleOrTypeLabel = pol?.office ?? 'Mandato'
      territoryLabel = pol?.city ? `${pol.city}/${pol.state}` : state
      advocatedCount = await this.prisma.timelineEvent.count({
        where: {
          type: EventType.RESPONDED,
          createdAt: { gte: start, lte: end },
          metadata: { path: ['action'], equals: 'advocated' },
          AND: [{ metadata: { path: ['politicianId'], equals: orgId } }],
        },
      })
    } else {
      const ent = await this.prisma.entity.findUnique({
        where: { id: orgId },
        select: { type: true, city: true, state: true },
      })
      roleOrTypeLabel = ent?.type ?? 'Entidade'
      territoryLabel = ent?.city ? `${ent.city}/${ent.state}` : state
    }

    // Relatos resolvidos de maior apoio no recorte (somente título, categoria, data e contagem — zero PII)
    const resolvedRows = await this.prisma.report.findMany({
      where: {
        state,
        ...(cityKey ? { cityKey } : {}),
        status: ReportStatus.RESOLVED,
        resolvedAt: { gte: start, lte: end },
      },
      select: {
        title: true,
        category: true,
        resolvedAt: true,
        _count: { select: { votes: true } },
      },
      orderBy: { pressureScore: 'desc' },
      take: 8,
    })

    const computedAt = new Date()
    const code = `VTZ-${fromStr.replace(/-/g, '').slice(0, 6)}-${randomBytes(4).toString('hex').toUpperCase()}`
    const appUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const verificationUrl = `${appUrl}/prestacao/${code}`

    const baseMetricsSource =
      orgType === OrgType.ENTITY && directedSummary && directedSummary.createdCount >= MIN_CELL_SIZE
        ? directedSummary
        : summary

    const suppressed = baseMetricsSource.createdCount < MIN_CELL_SIZE
    const matureDenom = baseMetricsSource.resolvedCount + baseMetricsSource.openOver7dCount
    const resolutionRatePercent =
      !suppressed && matureDenom > 0
        ? Number(((baseMetricsSource.resolvedCount / matureDenom) * 100).toFixed(1))
        : null
    const responseRatePercent =
      !suppressed && baseMetricsSource.createdCount > 0
        ? Number(((baseMetricsSource.responseCount / baseMetricsSource.createdCount) * 100).toFixed(1))
        : null

    const slaMet = directedSummary?.slaMetCount ?? summary.slaMetCount ?? 0
    const slaBreached = directedSummary?.slaBreachedCount ?? summary.slaBreachedCount ?? 0
    const slaDenom = slaMet + slaBreached
    const slaCompliancePercent =
      !suppressed && slaDenom > 0 ? Number(((slaMet / slaDenom) * 100).toFixed(1)) : null

    const medianResponseHours =
      baseMetricsSource.responseCount > 0
        ? computePercentileFromBuckets(
            baseMetricsSource.respBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            0.5,
          )
        : null
    const medianResolutionHours =
      baseMetricsSource.resolutionDurationCount > 0
        ? computePercentileFromBuckets(
            baseMetricsSource.resBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            0.5,
          )
        : null

    const topRecurrenceRows = recurrenceWindow ? recurrenceWindow.visibleRows.slice(0, 5) : []
    const recurrenceAreaLabels =
      recurrenceWindow &&
      topRecurrenceRows.length > 0 &&
      typeof this.analyticsRepo.fetchRecurrenceAreaLabels === 'function'
        ? await this.analyticsRepo.fetchRecurrenceAreaLabels(
            topRecurrenceRows.map((row) => ({
              state: row.state,
              cityKey: row.cityKey,
              cell7: row.cell7,
              category: row.category,
            })),
            new Date(
              (recurrenceWindow.windowEnd ?? new Date()).getTime() - 89 * 86_400_000,
            ),
            recurrenceWindow.windowEnd ?? new Date(),
          )
        : new Map<string, string>()

    const snapshot: AccountabilitySnapshot = {
      orgType: planScopeType,
      orgId,
      orgName,
      roleOrTypeLabel,
      territoryLabel,
      reportTitle:
        orgType === OrgType.ENTITY
          ? 'RELATÓRIO DE ATENDIMENTO — VOTZ'
          : 'PRESTAÇÃO DE CONTAS — VOTZ',
      periodStart: fromStr,
      periodEnd: toStr,
      previousPeriodStart: prevStart,
      previousPeriodEnd: prevEnd,
      code,
      verificationUrl,
      metrics: {
        received: baseMetricsSource.createdCount,
        responded: baseMetricsSource.responseCount,
        advocated: advocatedCount,
        resolved: baseMetricsSource.resolvedCount,
        medianResponseHours,
        medianResolutionHours,
        responseRatePercent,
        resolutionRatePercent,
        ...(orgType === OrgType.ENTITY
          ? { slaMet, slaBreached, slaCompliancePercent }
          : {}),
        previousReceived: prevSummary.createdCount,
        previousResolved: prevSummary.resolvedCount,
        suppressed,
      },
      topCategories: categories
        .slice()
        .sort((a, b) => b.createdCount - a.createdCount)
        .slice(0, 6)
        .map((c) => ({
          category: c.category,
          receivedCount: c.createdCount,
          resolvedCount: c.resolvedCount,
        })),
      ...(recurrenceWindow
        ? {
            recurrence: {
              windowEnd: recurrenceWindow.windowEnd
                ? recurrenceWindow.windowEnd.toISOString().slice(0, 10)
                : null,
              visibleCellsCount: recurrenceWindow.visibleTotal,
              suppressedCellsCount: recurrenceWindow.suppressedCellsCount,
              recurrenceIndexPercent:
                !suppressed && recurrenceWindow.total90dVolume >= MIN_CELL_SIZE
                  ? Number(
                      (
                        (recurrenceWindow.allRecurrentVolume / recurrenceWindow.total90dVolume) *
                        100
                      ).toFixed(1),
                    )
                  : null,
              topCells: topRecurrenceRows.map((row) => {
                const mapKey = `${row.state.toUpperCase()}|${row.cityKey}|${row.cell7}|${row.category}`
                return {
                  areaLabel: recurrenceAreaLabels.get(mapKey) ?? 'Área sem bairro informado',
                  category: String(row.category),
                  count90d: row.count90d,
                }
              }),
            },
          }
        : {}),
      topResolvedReports: resolvedRows.map((r) => ({
        title: r.title,
        category: r.category,
        resolvedAt: r.resolvedAt ? toSaoPauloDateString(r.resolvedAt) : toStr,
        supportCount: r._count.votes,
      })),
      methodology: {
        dictionaryVersion: ANALYTICS_DEFINITION_VERSION,
        dictionaryDate: ANALYTICS_DEFINITION_DATE,
        timezone: ANALYTICS_TIMEZONE,
        computedAt: computedAt.toISOString(),
        note: 'Relatório factual baseado exclusivamente nos rollups e registros públicos do Votz. Sem campo promocional, slogan ou dados pessoais de cidadãos.',
      },
    }

    const report = await this.prisma.$transaction(async (tx) => {
      if (monthlyLimit !== null) {
        const todaySp = toSaoPauloDateString(new Date())
        const monthStart = new Date(`${todaySp.slice(0, 7)}-01T03:00:00.000Z`)
        const lockKey = `accountability_quota:${orgType}:${orgId}:${todaySp.slice(0, 7)}`
        if (typeof (tx as { $executeRaw?: unknown }).$executeRaw === 'function') {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`.catch(
            () => null,
          )
        }
        const currentCount = await tx.accountabilityReport.count({
          where: { orgType, orgId, createdAt: { gte: monthStart } },
        })
        if (currentCount >= monthlyLimit) {
          throw new ForbiddenException(
            `Limite mensal de ${monthlyLimit} relatórios de prestação de contas atingido para o plano atual.`,
          )
        }
      }

      const created = await tx.accountabilityReport.create({
        data: {
          code,
          orgType,
          orgId,
          periodStart: fromStr,
          periodEnd: toStr,
          dictionaryVersion: ANALYTICS_DEFINITION_VERSION,
          computedAt,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          status: AccountabilityReportStatus.PENDING,
          createdById: actorId,
        },
      })
      await recordOrgAudit(tx, {
        action: 'CREATED',
        orgType,
        orgId,
        itemType: 'ACCOUNTABILITY_REPORT',
        itemId: created.id,
        actorId,
        summary: `Prestação de contas gerada (${fromStr} a ${toStr}, código ${code})`,
      })
      return created
    })

    await this.queue.add(
      'render-pdf',
      { reportId: report.id, notifyManagers },
      {
        jobId: `accountability:${report.id}`,
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    )

    return report
  }

  async renderReportPdfJob(reportId: string, notifyManagers = false): Promise<void> {
    const report = await this.prisma.accountabilityReport.findUnique({
      where: { id: reportId },
    })
    if (!report) return

    try {
      const snapshot = report.snapshot as unknown as AccountabilitySnapshot
      const pdfBuffer = await this.renderer.renderAccountabilityPdf(snapshot)
      const pdfKey = `exports/accountability/${report.orgId}/${report.code}.pdf`
      await this.storage.uploadBuffer(pdfKey, pdfBuffer, 'application/pdf', true)

      const pdfExpiresAt = new Date(
        Date.now() + ACCOUNTABILITY_EXPORT_TTL_DAYS * 86_400_000,
      )

      await this.prisma.accountabilityReport.update({
        where: { id: report.id },
        data: {
          pdfKey,
          pdfExpiresAt,
          status: AccountabilityReportStatus.READY,
          errorMessage: null,
        },
      })

      if (notifyManagers && report.orgType === OrgType.ENTITY && this.mail) {
        const signedDownloadUrl = await this.storage
          .getSignedDownloadUrl(pdfKey, 7 * 86_400)
          .catch(() => null)
        const managers = await this.prisma.orgMembership.findMany({
          where: {
            orgType: OrgType.ENTITY,
            orgId: report.orgId,
            status: MembershipStatus.ACTIVE,
            role: { permissions: { hasSome: [OrgPermission.MANAGE_PROFILE, OrgPermission.VIEW_ANALYTICS] } },
          },
          select: { user: { select: { email: true, name: true } } },
        })
        const periodLabel = `${report.periodStart} a ${report.periodEnd}`
        for (const member of managers) {
          if (!member.user.email) continue
          await this.mail.sendMonthlyAttendanceReport(member.user.email, member.user.name ?? 'Gestor(a)', {
            orgName: snapshot.orgName,
            periodLabel,
            code: report.code,
            signedDownloadUrl,
            verificationUrl: snapshot.verificationUrl,
          })
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.prisma.accountabilityReport.update({
        where: { id: report.id },
        data: {
          status: AccountabilityReportStatus.FAILED,
          errorMessage: msg.slice(0, 300),
        },
      })
      throw err
    }
  }

  async listReports(user: ActingUser) {
    const today = toSaoPauloDateString(new Date())
    const scope = await this.scopeService.resolveOrgScope(
      user,
      { from: today, to: today, scope: AnalyticsScopeMode.AREA },
      { forceTerritory: true },
    )
    const orgType = scope.orgType === 'POLITICIAN' ? OrgType.POLITICIAN : OrgType.ENTITY
    const monthlyLimit =
      getPlanConfig(scope.orgType, scope.plan)?.limits.maxPdfReportsPerMonth ?? null

    const monthStart = new Date(`${today.slice(0, 7)}-01T03:00:00.000Z`)
    const [items, usedThisMonth] = await Promise.all([
      this.prisma.accountabilityReport.findMany({
        where: { orgType, orgId: scope.orgId },
        select: {
          id: true,
          code: true,
          periodStart: true,
          periodEnd: true,
          dictionaryVersion: true,
          computedAt: true,
          status: true,
          pdfExpiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.accountabilityReport.count({
        where: { orgType, orgId: scope.orgId, createdAt: { gte: monthStart } },
      }),
    ])

    return { data: items, quota: { usedThisMonth, monthlyLimit } }
  }

  async getSignedDownloadUrl(user: ActingUser, reportId: string) {
    const today = toSaoPauloDateString(new Date())
    const scope = await this.scopeService.resolveOrgScope(
      user,
      { from: today, to: today, scope: AnalyticsScopeMode.AREA },
      { forceTerritory: true },
    )
    const orgType = scope.orgType === 'POLITICIAN' ? OrgType.POLITICIAN : OrgType.ENTITY
    const report = await this.prisma.accountabilityReport.findFirst({
      where: { id: reportId, orgType, orgId: scope.orgId },
    })
    if (!report) throw new NotFoundException('Relatório não encontrado')
    if (report.status !== AccountabilityReportStatus.READY || !report.pdfKey) {
      throw new BadRequestException('PDF ainda em processamento ou indisponível')
    }
    if (report.pdfExpiresAt && report.pdfExpiresAt <= new Date()) {
      throw new BadRequestException(
        'Arquivo expirado após 7 dias conforme política de retenção. Gere um novo relatório se precisar do PDF.',
      )
    }
    const url = await this.storage.getSignedDownloadUrl(report.pdfKey, 900)
    return { url, expiresInSeconds: 900, code: report.code }
  }

  async findPublicByCode(code: string) {
    const clean = code.trim().toUpperCase()
    const report = await this.prisma.accountabilityReport.findUnique({
      where: { code: clean },
      select: {
        code: true,
        orgType: true,
        periodStart: true,
        periodEnd: true,
        dictionaryVersion: true,
        computedAt: true,
        snapshot: true,
        createdAt: true,
      },
    })
    if (!report) throw new NotFoundException('Prestação de contas não encontrada')
    return report
  }

  async purgeExpiredPdfs(now = new Date()): Promise<{ purged: number }> {
    const expired = await this.prisma.accountabilityReport.findMany({
      where: {
        pdfKey: { not: null },
        pdfExpiresAt: { lte: now },
      },
      select: { id: true, pdfKey: true },
      take: 100,
    })

    let purged = 0
    for (const row of expired) {
      if (row.pdfKey) {
        await this.storage.delete(row.pdfKey).catch(() => null)
      }
      await this.prisma.accountabilityReport.update({
        where: { id: row.id },
        data: { pdfKey: null },
      })
      purged++
    }
    if (purged > 0) {
      this.logger.log(`Purged ${purged} expired accountability PDF files from exports/`)
    }
    return { purged }
  }
}
