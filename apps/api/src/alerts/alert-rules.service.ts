import { InjectQueue } from '@nestjs/bullmq'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import {
  AlertChannel,
  AlertFrequency,
  AlertRule,
  AlertRuleType,
  Category,
  OrgPermission,
  OrgType,
  Prisma,
  ReportStatus,
  WebhookEventType,
} from '@prisma/client'
import {
  OrgPlanType,
  getPlanConfig,
  normalizeLocationKey,
} from '@votz/shared-types'
import { Queue } from 'bullmq'
import DOMPurify from 'isomorphic-dompurify'
import { resolvePoliticianTerritory } from '../analytics/analytics.scope'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { recordOrgAudit } from '../common/audit/org-audit'
import { MailService } from '../mail/mail.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PrismaService } from '../prisma/prisma.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import { ALERTS_QUEUE } from './alerts.service'
import { CreateAlertRuleDto, UpdateAlertRuleDto } from './dto/alert-rule.dto'

interface TerritoryScope {
  orgType: OrgType
  orgId: string
  orgName: string
  state: string
  cityKey: string | null
  territoryLevel: 'CITY' | 'STATE'
}

interface MatchedItem {
  reportId: string | null
  surtoId: string | null
  dedupKey: string
  title: string
  category: string
  detail: string
  pressureScore: number
}

@Injectable()
export class AlertRulesService {
  private readonly logger = new Logger(AlertRulesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    @InjectQueue(ALERTS_QUEUE) private readonly queue: Queue,
    @Optional() private readonly webhooks?: WebhooksService,
  ) {}

  private async resolveOrgPlanLimit(orgType: OrgType, orgId: string): Promise<number> {
    if (orgType === OrgType.POLITICIAN) {
      const p = await this.prisma.politician.findUnique({
        where: { id: orgId },
        select: { plan: true },
      })
      return getPlanConfig('POLITICIAN', p?.plan ?? 'BASICO')?.limits.maxAlertRules ?? 0
    }
    if (orgType === OrgType.ENTITY) {
      const e = await this.prisma.entity.findUnique({
        where: { id: orgId },
        select: { plan: true },
      })
      return getPlanConfig('ENTITY', e?.plan ?? 'BASICO')?.limits.maxAlertRules ?? 0
    }
    return getPlanConfig(orgType as OrgPlanType, 'BASICO')?.limits.maxAlertRules ?? 0
  }

  async resolveTerritoryForOrg(orgType: OrgType, orgId: string): Promise<TerritoryScope | null> {
    if (orgType === OrgType.POLITICIAN) {
      const p = await this.prisma.politician.findUnique({
        where: { id: orgId },
        select: { id: true, name: true, office: true, state: true, city: true, status: true },
      })
      if (!p) return null
      try {
        const t = resolvePoliticianTerritory(p)
        return { orgType, orgId, orgName: p.name, ...t }
      } catch {
        return null
      }
    }
    if (orgType === OrgType.ENTITY) {
      const e = await this.prisma.entity.findUnique({
        where: { id: orgId },
        select: { id: true, legalName: true, state: true, city: true },
      })
      if (!e || !e.state) return null
      const state = e.state.trim().toUpperCase()
      const cityKey = normalizeLocationKey(e.city) || null
      return {
        orgType,
        orgId,
        orgName: e.legalName,
        state,
        cityKey,
        territoryLevel: cityKey ? 'CITY' : 'STATE',
      }
    }
    return null
  }

  async listRules(user: ActingUser) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.VIEW_ANALYTICS,
    )
    const limit = await this.resolveOrgPlanLimit(acting.orgType, acting.orgId)
    const rules = await this.prisma.alertRule.findMany({
      where: { orgType: acting.orgType, orgId: acting.orgId },
      orderBy: { createdAt: 'desc' },
    })
    return { data: rules, limit }
  }

  async createRule(user: ActingUser, dto: CreateAlertRuleDto) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.VIEW_ANALYTICS,
    )
    const limit = await this.resolveOrgPlanLimit(acting.orgType, acting.orgId)
    const existingCount = await this.prisma.alertRule.count({
      where: { orgType: acting.orgType, orgId: acting.orgId },
    })
    if (existingCount >= limit) {
      throw new ForbiddenException(
        `Limite de ${limit} regras de alerta atingido para o plano atual.`,
      )
    }

    if (dto.ruleType === AlertRuleType.PRESSURE_THRESHOLD && !dto.minPressure) {
      throw new BadRequestException('Informe minPressure para alertas de pressão')
    }
    if (dto.ruleType === AlertRuleType.STALLED_REPORT && !dto.stalledDays) {
      throw new BadRequestException('Informe stalledDays para alertas de relato parado')
    }

    const wholeArea = dto.wholeArea ?? (!dto.cell7s || dto.cell7s.length === 0)
    if (!wholeArea && (!dto.cell7s || dto.cell7s.length === 0)) {
      throw new BadRequestException('Informe ao menos uma célula geohash ou marque wholeArea=true')
    }

    const cleanName = DOMPurify.sanitize(dto.name, { ALLOWED_TAGS: [] }).trim()
    if (cleanName.length < 3) {
      throw new BadRequestException('Nome da regra inválido')
    }

    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.alertRule.create({
        data: {
          orgType: acting.orgType,
          orgId: acting.orgId,
          name: cleanName,
          ruleType: dto.ruleType,
          categories: Array.from(new Set(dto.categories ?? [])),
          cell7s: wholeArea ? [] : Array.from(new Set(dto.cell7s ?? [])),
          wholeArea,
          minPressure: dto.minPressure ?? null,
          stalledDays: dto.stalledDays ?? null,
          channels: Array.from(new Set(dto.channels)),
          frequency: dto.frequency ?? AlertFrequency.IMMEDIATE,
          createdById: user.id,
        },
      })
      await recordOrgAudit(tx, {
        action: 'CREATED',
        orgType: acting.orgType,
        orgId: acting.orgId,
        itemType: 'ALERT_RULE',
        itemId: rule.id,
        actorId: user.id,
        summary: `Regra de alerta criada: ${cleanName} (${rule.ruleType})`,
      })
      return rule
    })
  }

  async updateRule(user: ActingUser, id: string, dto: UpdateAlertRuleDto) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.VIEW_ANALYTICS,
    )
    const existing = await this.prisma.alertRule.findFirst({
      where: { id, orgType: acting.orgType, orgId: acting.orgId },
    })
    if (!existing) throw new NotFoundException('Regra de alerta não encontrada')

    return this.prisma.alertRule.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined
          ? { name: DOMPurify.sanitize(dto.name, { ALLOWED_TAGS: [] }).trim() }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
        ...(dto.channels !== undefined ? { channels: Array.from(new Set(dto.channels)) } : {}),
        ...(dto.minPressure !== undefined ? { minPressure: dto.minPressure } : {}),
        ...(dto.stalledDays !== undefined ? { stalledDays: dto.stalledDays } : {}),
      },
    })
  }

  async deleteRule(user: ActingUser, id: string) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.VIEW_ANALYTICS,
    )
    const existing = await this.prisma.alertRule.findFirst({
      where: { id, orgType: acting.orgType, orgId: acting.orgId },
    })
    if (!existing) throw new NotFoundException('Regra de alerta não encontrada')

    await this.prisma.$transaction(async (tx) => {
      await tx.alertRule.delete({ where: { id: existing.id } })
      await recordOrgAudit(tx, {
        action: 'DELETED',
        orgType: acting.orgType,
        orgId: acting.orgId,
        itemType: 'ALERT_RULE',
        itemId: existing.id,
        actorId: user.id,
        summary: `Regra de alerta removida: ${existing.name}`,
      })
    })
    return { deleted: true }
  }

  async listHistory(user: ActingUser) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.VIEW_ANALYTICS,
    )
    return this.prisma.alertTriggerLog.findMany({
      where: { rule: { orgType: acting.orgType, orgId: acting.orgId } },
      select: {
        id: true,
        ruleId: true,
        reportId: true,
        surtoId: true,
        deliveredAt: true,
        digestSentAt: true,
        rule: { select: { name: true, ruleType: true } },
      },
      orderBy: { deliveredAt: 'desc' },
      take: 50,
    })
  }

  async enqueueReportRuleCheck(reportId: string): Promise<void> {
    await this.queue.add(
      'evaluate-report-rules',
      { reportId },
      {
        jobId: `rules-report-${reportId}`,
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    )
  }

  async enqueuePeriodicSweep(): Promise<void> {
    await this.queue.add(
      'evaluate-rules-sweep',
      {},
      {
        jobId: 'rules-periodic-sweep',
        removeOnComplete: 10,
        removeOnFail: 10,
        attempts: 2,
      },
    )
  }

  private matchesReportTerritory(
    territory: TerritoryScope,
    report: { state: string | null; cityKey: string | null },
  ): boolean {
    const rState = (report.state ?? '').trim().toUpperCase()
    if (!rState || rState !== territory.state) return false
    if (territory.territoryLevel === 'CITY' && territory.cityKey) {
      return (report.cityKey ?? '') === territory.cityKey
    }
    return true
  }

  private matchesRuleFilters(
    rule: AlertRule,
    item: { category: Category; cell7: string | null; pressureScore?: number },
  ): boolean {
    if (rule.categories.length > 0 && !rule.categories.includes(item.category)) {
      return false
    }
    if (!rule.wholeArea && rule.cell7s.length > 0) {
      if (!item.cell7 || !rule.cell7s.includes(item.cell7)) {
        return false
      }
    }
    return true
  }

  async evaluateRulesForReport(reportId: string): Promise<number> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        state: true,
        cityKey: true,
        cell7: true,
        pressureScore: true,
        recipientType: true,
        recipientId: true,
        createdAt: true,
      },
    })
    if (!report) return 0

    const rules = await this.prisma.alertRule.findMany({
      where: {
        active: true,
        ruleType: { in: [AlertRuleType.NEW_REPORT, AlertRuleType.PRESSURE_THRESHOLD] },
      },
    })

    let fired = 0
    const scopeCache = new Map<string, TerritoryScope | null>()

    for (const rule of rules) {
      const cacheKey = `${rule.orgType}:${rule.orgId}`
      if (!scopeCache.has(cacheKey)) {
        scopeCache.set(cacheKey, await this.resolveTerritoryForOrg(rule.orgType, rule.orgId))
      }
      const territory = scopeCache.get(cacheKey)
      if (!territory || !this.matchesReportTerritory(territory, report)) {
        continue
      }
      if (!this.matchesRuleFilters(rule, report)) {
        continue
      }
      if (
        rule.ruleType === AlertRuleType.PRESSURE_THRESHOLD &&
        report.pressureScore < (rule.minPressure ?? 50)
      ) {
        continue
      }

      const dedupKey = `${rule.id}:report:${report.id}`
      const inserted = await this.recordTriggerIfNew(rule, {
        reportId: report.id,
        surtoId: null,
        dedupKey,
        title: report.title,
        category: report.category,
        detail:
          rule.ruleType === AlertRuleType.PRESSURE_THRESHOLD
            ? `pressão ${Math.round(report.pressureScore)}`
            : 'novo relato na área',
        pressureScore: report.pressureScore,
      })

      if (inserted) {
        fired++
        if (rule.frequency === AlertFrequency.IMMEDIATE) {
          await this.deliverBatch(rule, territory, [inserted])
        }
        if (rule.ruleType === AlertRuleType.PRESSURE_THRESHOLD) {
          this.webhooks
            ?.enqueueEvent(
              rule.orgType,
              rule.orgId,
              WebhookEventType.REPORT_PRESSURE_THRESHOLD,
              `pressure:${report.id}:${rule.id}`,
              {
                reportId: report.id,
                title: report.title,
                category: report.category,
                pressureScore: report.pressureScore,
                threshold: rule.minPressure,
              },
            )
            .catch(() => null)
        }
      }
    }
    return fired
  }

  async runPeriodicSweep(now = new Date()): Promise<{ matched: number; digestBatches: number }> {
    const rules = await this.prisma.alertRule.findMany({ where: { active: true } })
    const scopeCache = new Map<string, TerritoryScope | null>()
    let matched = 0

    for (const rule of rules) {
      const cacheKey = `${rule.orgType}:${rule.orgId}`
      if (!scopeCache.has(cacheKey)) {
        scopeCache.set(cacheKey, await this.resolveTerritoryForOrg(rule.orgType, rule.orgId))
      }
      const territory = scopeCache.get(cacheKey)
      if (!territory) continue

      const matches: MatchedItem[] = []
      const baseReportWhere: Prisma.ReportWhereInput = {
        state: territory.state,
        ...(territory.territoryLevel === 'CITY' && territory.cityKey
          ? { cityKey: territory.cityKey }
          : {}),
        ...(rule.categories.length > 0 ? { category: { in: rule.categories } } : {}),
        ...(!rule.wholeArea && rule.cell7s.length > 0 ? { cell7: { in: rule.cell7s } } : {}),
      }

      if (rule.ruleType === AlertRuleType.PRESSURE_THRESHOLD) {
        const candidates = await this.prisma.report.findMany({
          where: {
            ...baseReportWhere,
            pressureScore: { gte: rule.minPressure ?? 50 },
            status: { in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW, ReportStatus.IN_PROGRESS] },
          },
          select: { id: true, title: true, category: true, pressureScore: true },
          orderBy: { pressureScore: 'desc' },
          take: 25,
        })
        for (const r of candidates) {
          const item = await this.recordTriggerIfNew(rule, {
            reportId: r.id,
            surtoId: null,
            dedupKey: `${rule.id}:report:${r.id}`,
            title: r.title,
            category: r.category,
            detail: `pressão ${Math.round(r.pressureScore)}`,
            pressureScore: r.pressureScore,
          })
          if (item) matches.push(item)
        }
      } else if (rule.ruleType === AlertRuleType.STALLED_REPORT) {
        const days = rule.stalledDays ?? 7
        const cutoff = new Date(now.getTime() - days * 86_400_000)
        const monthTag = now.toISOString().slice(0, 7)
        const candidates = await this.prisma.report.findMany({
          where: {
            ...baseReportWhere,
            firstResponseAt: null,
            createdAt: { lte: cutoff },
            status: { in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW] },
          },
          select: { id: true, title: true, category: true, pressureScore: true },
          orderBy: { pressureScore: 'desc' },
          take: 25,
        })
        for (const r of candidates) {
          const item = await this.recordTriggerIfNew(rule, {
            reportId: r.id,
            surtoId: null,
            dedupKey: `${rule.id}:stalled:${r.id}:${monthTag}`,
            title: r.title,
            category: r.category,
            detail: `sem resposta há mais de ${days} dia(s)`,
            pressureScore: r.pressureScore,
          })
          if (item) matches.push(item)
        }
      } else if (rule.ruleType === AlertRuleType.SURTO) {
        const surtos = await this.prisma.surto.findMany({
          where: {
            active: true,
            state: territory.state,
            ...(rule.categories.length > 0 ? { category: { in: rule.categories } } : {}),
          },
          orderBy: { detectedAt: 'desc' },
          take: 20,
        })
        for (const s of surtos) {
          if (territory.territoryLevel === 'CITY' && territory.cityKey) {
            if (normalizeLocationKey(s.city) !== territory.cityKey) continue
          }
          const item = await this.recordTriggerIfNew(rule, {
            reportId: null,
            surtoId: s.id,
            dedupKey: `${rule.id}:surto:${s.id}`,
            title: `Surto de ${s.category} em ${s.city}/${s.state}`,
            category: s.category,
            detail: `${s.count} relatos em 24h`,
            pressureScore: s.count,
          })
          if (item) matches.push(item)
        }
      }

      if (matches.length > 0) {
        matched += matches.length
        if (rule.frequency === AlertFrequency.IMMEDIATE) {
          await this.deliverBatch(rule, territory, matches)
        }
      }
    }

    // Flush DAILY_DIGEST triggers once per day (group pending triggers)
    let digestBatches = 0
    const pendingDaily = await this.prisma.alertTriggerLog.findMany({
      where: {
        digestSentAt: null,
        rule: { active: true, frequency: AlertFrequency.DAILY_DIGEST },
      },
      include: { rule: true },
      orderBy: { deliveredAt: 'asc' },
      take: 200,
    })

    if (pendingDaily.length > 0) {
      const groupedByRule = new Map<string, { rule: AlertRule; logs: typeof pendingDaily }>()
      for (const row of pendingDaily) {
        const group = groupedByRule.get(row.ruleId) ?? { rule: row.rule, logs: [] }
        group.logs.push(row)
        groupedByRule.set(row.ruleId, group)
      }

      for (const { rule, logs } of groupedByRule.values()) {
        const key = `${rule.orgType}:${rule.orgId}`
        const territory =
          scopeCache.get(key) ?? (await this.resolveTerritoryForOrg(rule.orgType, rule.orgId))
        if (!territory) continue

        await this.deliverBatch(
          rule,
          territory,
          logs.map((l) => ({
            reportId: l.reportId,
            surtoId: l.surtoId,
            dedupKey: l.dedupKey,
            title: l.reportId ? `Relato ${l.reportId.slice(0, 8)}` : `Surto ativo`,
            category: rule.categories[0] ?? 'GERAL',
            detail: 'resumo diário',
            pressureScore: 0,
          })),
        )
        await this.prisma.alertTriggerLog.updateMany({
          where: { id: { in: logs.map((l) => l.id) } },
          data: { digestSentAt: now },
        })
        digestBatches++
      }
    }

    return { matched, digestBatches }
  }

  private async recordTriggerIfNew(
    rule: AlertRule,
    item: MatchedItem,
  ): Promise<MatchedItem | null> {
    const batchKey =
      rule.frequency === AlertFrequency.DAILY_DIGEST
        ? `${rule.id}:${new Date().toISOString().slice(0, 10)}`
        : null
    try {
      await this.prisma.alertTriggerLog.create({
        data: {
          ruleId: rule.id,
          reportId: item.reportId,
          surtoId: item.surtoId,
          dedupKey: item.dedupKey,
          batchKey,
          digestSentAt: rule.frequency === AlertFrequency.IMMEDIATE ? new Date() : null,
        },
      })
      return item
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return null
      }
      throw err
    }
  }

  private async deliverBatch(
    rule: AlertRule,
    territory: TerritoryScope,
    items: MatchedItem[],
  ): Promise<void> {
    if (items.length === 0) return
    const members = await this.prisma.orgMembership.findMany({
      where: {
        orgType: rule.orgType,
        orgId: rule.orgId,
        status: 'ACTIVE',
      },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true, emailVerified: true } },
      },
    })
    if (members.length === 0) return

    const firstReportId = items.find((i) => i.reportId)?.reportId ?? null

    if (rule.channels.includes(AlertChannel.IN_APP)) {
      for (const m of members) {
        await this.notifications
          .notify({
            userId: m.userId,
            type: 'ALERT_RULE_MATCHED',
            reportId: firstReportId,
            metadata: {
              ruleId: rule.id,
              ruleName: rule.name,
              count: items.length,
              summary: items[0].title,
            },
          })
          .catch(() => null)
      }
    }

    if (rule.channels.includes(AlertChannel.EMAIL)) {
      for (const m of members) {
        if (!m.user?.email || !m.user.emailVerified) continue
        await this.mail
          .sendOrgAlertNotification(m.user.email, m.user.name, {
            orgName: territory.orgName,
            ruleName: rule.name,
            itemsCount: items.length,
            highlights: items.map((i) => ({
              title: i.title,
              category: i.category,
              detail: i.detail,
              reportId: i.reportId,
            })),
          })
          .catch(() => null)
      }
    }
  }
}
