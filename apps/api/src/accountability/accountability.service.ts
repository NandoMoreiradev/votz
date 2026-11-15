import { InjectQueue } from '@nestjs/bullmq'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AccountabilityReportStatus,
  EventType,
  OrgPermission,
  OrgType,
  Prisma,
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
    const planCfg = getPlanConfig(scope.orgType, scope.plan)
    const monthlyLimit = planCfg?.limits.maxPdfReportsPerMonth ?? 0

    if (monthlyLimit !== null) {
      const todaySp = toSaoPauloDateString(new Date())
      const monthStart = new Date(`${todaySp.slice(0, 7)}-01T03:00:00.000Z`)
      const createdInMonth = await this.prisma.accountabilityReport.count({
        where: {
          orgType,
          orgId: scope.orgId,
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

    const areaFilter = { state: scope.state, cityKey: scope.cityKey, from: fromStr, to: toStr }
    const prevAreaFilter = { state: scope.state, cityKey: scope.cityKey, from: prevStart, to: prevEnd }

    const [summary, prevSummary, categories] = await Promise.all([
      this.analyticsRepo.fetchAreaSummary(areaFilter, matureCutoff),
      this.analyticsRepo.fetchAreaSummary(prevAreaFilter, matureCutoff),
      this.analyticsRepo.fetchCategoryBreakdown('area', areaFilter, null, matureCutoff),
    ])

    const { start, end } = this.buildPeriodTimestamps(fromStr, toStr)

    let advocatedCount = 0
    let roleOrTypeLabel = 'Organização pública'
    let territoryLabel = `${scope.state}`

    if (orgType === OrgType.POLITICIAN) {
      const pol = await this.prisma.politician.findUnique({
        where: { id: scope.orgId },
        select: { office: true, city: true, state: true },
      })
      roleOrTypeLabel = pol?.office ?? 'Mandato'
      territoryLabel = pol?.city ? `${pol.city}/${pol.state}` : scope.state
      advocatedCount = await this.prisma.timelineEvent.count({
        where: {
          type: EventType.RESPONDED,
          createdAt: { gte: start, lte: end },
          metadata: { path: ['action'], equals: 'advocated' },
          AND: [{ metadata: { path: ['politicianId'], equals: scope.orgId } }],
        },
      })
    } else {
      const ent = await this.prisma.entity.findUnique({
        where: { id: scope.orgId },
        select: { type: true, city: true, state: true },
      })
      roleOrTypeLabel = ent?.type ?? 'Entidade'
      territoryLabel = ent?.city ? `${ent.city}/${ent.state}` : scope.state
    }

    // Relatos resolvidos de maior apoio na área (somente título, categoria, data e contagem — zero PII)
    const resolvedRows = await this.prisma.report.findMany({
      where: {
        state: scope.state,
        ...(scope.cityKey ? { cityKey: scope.cityKey } : {}),
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

    const suppressed = summary.createdCount < MIN_CELL_SIZE
    const matureDenom = summary.resolvedCount + summary.openOver7dCount
    const resolutionRatePercent =
      !suppressed && matureDenom > 0
        ? Number(((summary.resolvedCount / matureDenom) * 100).toFixed(1))
        : null
    const responseRatePercent =
      !suppressed && summary.createdCount > 0
        ? Number(((summary.responseCount / summary.createdCount) * 100).toFixed(1))
        : null

    const medianResponseHours =
      summary.responseCount > 0
        ? computePercentileFromBuckets(
            summary.respBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            0.5,
          )
        : null
    const medianResolutionHours =
      summary.resolutionDurationCount > 0
        ? computePercentileFromBuckets(
            summary.resBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            0.5,
          )
        : null

    const snapshot: AccountabilitySnapshot = {
      orgType: scope.orgType,
      orgId: scope.orgId,
      orgName: scope.orgName,
      roleOrTypeLabel,
      territoryLabel,
      periodStart: fromStr,
      periodEnd: toStr,
      previousPeriodStart: prevStart,
      previousPeriodEnd: prevEnd,
      code,
      verificationUrl,
      metrics: {
        received: summary.createdCount,
        responded: summary.responseCount,
        advocated: advocatedCount,
        resolved: summary.resolvedCount,
        medianResponseHours,
        medianResolutionHours,
        responseRatePercent,
        resolutionRatePercent,
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
      const created = await tx.accountabilityReport.create({
        data: {
          code,
          orgType,
          orgId: scope.orgId,
          periodStart: fromStr,
          periodEnd: toStr,
          dictionaryVersion: ANALYTICS_DEFINITION_VERSION,
          computedAt,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          status: AccountabilityReportStatus.PENDING,
          createdById: user.id,
        },
      })
      await recordOrgAudit(tx, {
        action: 'CREATED',
        orgType,
        orgId: scope.orgId,
        itemType: 'ACCOUNTABILITY_REPORT',
        itemId: created.id,
        actorId: user.id,
        summary: `Prestação de contas gerada (${fromStr} a ${toStr}, código ${code})`,
      })
      return created
    })

    await this.queue.add(
      'render-pdf',
      { reportId: report.id },
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

  async renderReportPdfJob(reportId: string): Promise<void> {
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
