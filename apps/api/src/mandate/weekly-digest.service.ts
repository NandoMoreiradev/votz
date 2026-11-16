import { InjectQueue } from '@nestjs/bullmq'
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  EventType,
  OrgPermission,
  OrgType,
  ReportStatus,
} from '@prisma/client'
import {
  ANALYTICS_DEFINITION_VERSION,
  RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
  computePercentileFromBuckets,
} from '@votz/shared-types'
import { Queue } from 'bullmq'
import { randomBytes } from 'crypto'
import {
  addDaysDateString,
  toSaoPauloDateString,
} from '../analytics/analytics.constants'
import { AnalyticsRepository } from '../analytics/analytics.repository'
import { resolvePoliticianTerritory } from '../analytics/analytics.scope'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { recordOrgAudit } from '../common/audit/org-audit'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateDigestSettingsDto } from './dto/mandate.dto'

export const WEEKLY_DIGEST_QUEUE = 'mandate-digest'
export const DIGEST_LEGAL_BASIS =
  'LEGITIMATE_INTEREST_OPT_IN_MANDATE_DIGEST_LGPD_ART7_IX'

export function getSaoPauloClock(now = new Date()): {
  dateStr: string
  dayOfWeek: number
  hour: number
  isoWeek: string
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const hour = Number(get('hour')) % 24

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const dayOfWeek = weekdayMap[get('weekday')] ?? 1

  // Compute ISO-8601 week key using calendar date in America/Sao_Paulo
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  const isoDay = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoDay)
  const isoYear = utcDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const weekNo = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const isoWeek = `${isoYear}-W${String(weekNo).padStart(2, '0')}`
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  return { dateStr, dayOfWeek, hour, isoWeek }
}

@Injectable()
export class WeeklyDigestService {
  private readonly logger = new Logger(WeeklyDigestService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsRepo: AnalyticsRepository,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @InjectQueue(WEEKLY_DIGEST_QUEUE) private readonly queue: Queue,
  ) {}

  async getOrInitSettings(orgType: OrgType, orgId: string) {
    const existing = await this.prisma.mandateSettings.findUnique({
      where: { orgType_orgId: { orgType, orgId } },
    })
    if (existing) return existing

    return this.prisma.mandateSettings.create({
      data: {
        orgType,
        orgId,
        digestUnsubscribeToken: randomBytes(24).toString('hex'),
      },
    })
  }

  async getSettings(user: ActingUser) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN'],
      OrgPermission.VIEW_ANALYTICS,
    )
    const settings = await this.getOrInitSettings(OrgType.POLITICIAN, acting.orgId)
    return {
      digestEnabled: settings.digestEnabled,
      digestDayOfWeek: settings.digestDayOfWeek,
      digestHour: settings.digestHour,
      digestLegalBasis: settings.digestLegalBasis,
      digestLegalBasisAcceptedAt: settings.digestLegalBasisAcceptedAt,
      digestLastSentWeek: settings.digestLastSentWeek,
      monthlyGoal: settings.monthlyGoal,
    }
  }

  async updateSettings(user: ActingUser, dto: UpdateDigestSettingsDto) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN'],
      OrgPermission.MANAGE_PROFILE,
    )
    const current = await this.getOrInitSettings(OrgType.POLITICIAN, acting.orgId)

    if (dto.digestEnabled && !dto.legalBasisAccepted && !current.digestLegalBasisAcceptedAt) {
      throw new BadRequestException(
        'É necessário registrar a ciência da base legal (LGPD) antes de ativar o resumo semanal por e-mail.',
      )
    }

    const updated = await this.prisma.mandateSettings.update({
      where: { id: current.id },
      data: {
        digestEnabled: dto.digestEnabled,
        digestDayOfWeek: dto.digestDayOfWeek ?? current.digestDayOfWeek,
        digestHour: dto.digestHour ?? current.digestHour,
        digestLegalBasis: dto.digestEnabled
          ? DIGEST_LEGAL_BASIS
          : current.digestLegalBasis,
        digestLegalBasisAcceptedAt: dto.digestEnabled
          ? current.digestLegalBasisAcceptedAt ?? new Date()
          : current.digestLegalBasisAcceptedAt,
      },
    })

    await recordOrgAudit(this.prisma, {
      action: 'CREATED',
      orgType: OrgType.POLITICIAN,
      orgId: acting.orgId,
      itemType: 'MANDATE_DIGEST_PREFERENCE',
      itemId: updated.id,
      actorId: user.id,
      summary: `Resumo semanal ${updated.digestEnabled ? 'ativado' : 'desativado'} (dia ${updated.digestDayOfWeek}, ${updated.digestHour}h)`,
    })

    return {
      digestEnabled: updated.digestEnabled,
      digestDayOfWeek: updated.digestDayOfWeek,
      digestHour: updated.digestHour,
      digestLegalBasis: updated.digestLegalBasis,
      digestLegalBasisAcceptedAt: updated.digestLegalBasisAcceptedAt,
      digestLastSentWeek: updated.digestLastSentWeek,
    }
  }

  async previewUnsubscribeByToken(token: string) {
    const cleanToken = token?.trim()
    if (!cleanToken || cleanToken.length < 16) {
      throw new BadRequestException('Token de descadastro inválido')
    }

    const existing = await this.prisma.mandateSettings.findUnique({
      where: { digestUnsubscribeToken: cleanToken },
      select: { id: true, digestEnabled: true },
    })
    if (!existing) {
      throw new NotFoundException('Preferência de resumo não encontrada para este token')
    }

    // Leitura pura sem mutação (evita descadastro acidental por prefetch de antivírus/e-mail)
    return {
      valid: true,
      alreadyUnsubscribed: !existing.digestEnabled,
      message: existing.digestEnabled
        ? 'Confirme no botão abaixo para cancelar o recebimento do resumo semanal do mandato.'
        : 'Este endereço já está descadastrado do resumo semanal do mandato.',
    }
  }

  async confirmUnsubscribeByToken(token: string) {
    const cleanToken = token?.trim()
    if (!cleanToken || cleanToken.length < 16) {
      throw new BadRequestException('Token de descadastro inválido')
    }

    const existing = await this.prisma.mandateSettings.findUnique({
      where: { digestUnsubscribeToken: cleanToken },
    })
    if (!existing) {
      throw new NotFoundException('Preferência de resumo não encontrada para este token')
    }

    if (existing.digestEnabled) {
      await this.prisma.mandateSettings.update({
        where: { id: existing.id },
        data: { digestEnabled: false },
      })
      await recordOrgAudit(this.prisma, {
        action: 'DELETED',
        orgType: existing.orgType,
        orgId: existing.orgId,
        itemType: 'MANDATE_DIGEST_PREFERENCE',
        itemId: existing.id,
        summary: 'Descadastro confirmado via POST (token de e-mail)',
      })
    }

    return {
      unsubscribed: true,
      message: 'Você não receberá mais o resumo semanal do mandato por e-mail.',
    }
  }

  async buildWeeklyDigestData(politicianId: string, now = new Date()) {
    const pol = await this.prisma.politician.findUnique({
      where: { id: politicianId },
      select: { id: true, name: true, office: true, state: true, city: true, plan: true },
    })
    if (!pol) return null

    const territory = resolvePoliticianTerritory({
      office: pol.office,
      state: pol.state,
      city: pol.city,
    })

    const todaySp = toSaoPauloDateString(now)
    const weekEnd = addDaysDateString(todaySp, -1)
    const weekStart = addDaysDateString(weekEnd, -6)
    const prevEnd = addDaysDateString(weekStart, -1)
    const prevStart = addDaysDateString(prevEnd, -6)
    const matureCutoffDay = addDaysDateString(todaySp, -7)

    const [currSummary, prevSummary] = await Promise.all([
      this.analyticsRepo.fetchAreaSummary(
        {
          state: territory.state,
          cityKey: territory.cityKey,
          from: weekStart,
          to: weekEnd,
        },
        matureCutoffDay,
      ),
      this.analyticsRepo.fetchAreaSummary(
        {
          state: territory.state,
          cityKey: territory.cityKey,
          from: prevStart,
          to: prevEnd,
        },
        matureCutoffDay,
      ),
    ])

    const currMedian =
      currSummary.responseCount > 0
        ? computePercentileFromBuckets(
            currSummary.respBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            0.5,
          )
        : null
    const prevMedian =
      prevSummary.responseCount > 0
        ? computePercentileFromBuckets(
            prevSummary.respBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            0.5,
          )
        : null

    const whereTerritory = {
      state: territory.state,
      ...(territory.cityKey ? { cityKey: territory.cityKey } : {}),
      status: {
        in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW, ReportStatus.IN_PROGRESS],
      },
      timeline: { none: { type: EventType.RESPONDED } },
    }

    const topUnanswered = await this.prisma.report.findMany({
      where: whereTerritory,
      orderBy: [{ pressureScore: 'desc' }, { createdAt: 'asc' }],
      take: 3,
      select: {
        id: true,
        title: true,
        category: true,
        neighborhood: true,
        city: true,
        pressureScore: true,
      },
    })

    const appUrl = (this.config.get<string>('APP_URL') ?? 'https://votz.org.br').replace(/\/$/, '')
    const mode = pol.plan === 'BASICO' ? ('CONDENSED' as const) : ('DETAILED' as const)

    return {
      politicianName: pol.name,
      territoryLabel: territory.cityKey
        ? `${territory.cityKey.split('|')[0]} / ${territory.state}`
        : territory.state,
      mode,
      periodLabel: `${weekStart} a ${weekEnd}`,
      newReportsCount: currSummary.createdCount,
      resolvedCount: currSummary.resolvedCount,
      medianResponseHours: currMedian,
      previousMedianResponseHours: prevMedian,
      topUnanswered: topUnanswered.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        locationLabel: r.neighborhood ?? r.city ?? territory.state,
        pressureScore: Math.round(r.pressureScore),
        inboxUrl: `${appUrl}/mandato?reportId=${r.id}`,
      })),
      inboxUrl: `${appUrl}/mandato`,
    }
  }

  async enqueueDueDigests(now = new Date()) {
    const clock = getSaoPauloClock(now)
    const dueSettings = await this.prisma.mandateSettings.findMany({
      where: {
        orgType: OrgType.POLITICIAN,
        digestEnabled: true,
        digestDayOfWeek: clock.dayOfWeek,
        digestHour: clock.hour,
        OR: [
          { digestLastSentWeek: null },
          { digestLastSentWeek: { not: clock.isoWeek } },
        ],
      },
      select: { orgType: true, orgId: true },
    })

    for (const s of dueSettings) {
      await this.queue.add(
        'send-weekly-digest',
        {
          orgType: s.orgType,
          orgId: s.orgId,
          weekKey: clock.isoWeek,
        },
        {
          jobId: `weekly-digest-${s.orgType}-${s.orgId}-${clock.isoWeek}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      )
    }

    return { enqueued: dueSettings.length, weekKey: clock.isoWeek }
  }

  async processDigestJob(
    orgType: OrgType,
    orgId: string,
    weekKey: string,
    options?: { force?: boolean },
  ) {
    if (orgType !== OrgType.POLITICIAN) return { skipped: true }

    if (!options?.force) {
      // Idempotência atômica: garante no banco no máximo 1 envio por semana por mandato
      const claimed = await this.prisma.mandateSettings.updateMany({
        where: {
          orgType,
          orgId,
          digestEnabled: true,
          OR: [
            { digestLastSentWeek: null },
            { digestLastSentWeek: { not: weekKey } },
          ],
        },
        data: { digestLastSentWeek: weekKey },
      })
      if (claimed.count === 0) {
        return { skipped: true, reason: 'already_sent_or_disabled' }
      }
    }

    const settings = await this.prisma.mandateSettings.findUnique({
      where: { orgType_orgId: { orgType, orgId } },
    })
    if (!settings) return { skipped: true }

    const payload = await this.buildWeeklyDigestData(orgId)
    if (!payload) return { skipped: true }

    const members = await this.prisma.orgMembership.findMany({
      where: {
        orgType,
        orgId,
        status: 'ACTIVE',
      },
      include: {
        user: { select: { email: true, name: true } },
        role: { select: { permissions: true } },
      },
    })

    const recipients = members.filter(
      (m) =>
        m.user?.email &&
        (m.role.permissions.includes(OrgPermission.VIEW_ANALYTICS) ||
          m.role.permissions.includes(OrgPermission.RESPOND_REPORTS)),
    )

    let sent = 0
    for (const r of recipients) {
      await this.mail.sendWeeklyMandateDigest(
        r.user.email,
        r.user.name || payload.politicianName,
        {
          orgName: payload.politicianName,
          territoryLabel: payload.territoryLabel,
          weekLabel: payload.periodLabel,
          newReportsCount: payload.newReportsCount,
          resolvedCount: payload.resolvedCount,
          medianResponseHours: payload.medianResponseHours,
          prevMedianResponseHours: payload.previousMedianResponseHours,
          detailed: payload.mode === 'DETAILED',
          topUnanswered: payload.topUnanswered.map((t) => ({
            id: t.id,
            title: t.title,
            category: t.category,
            pressureScore: t.pressureScore,
          })),
          unsubscribeToken: settings.digestUnsubscribeToken,
          definitionVersion: ANALYTICS_DEFINITION_VERSION,
        },
      )
      sent++
    }

    this.logger.log(
      `Resumo semanal ${weekKey} (${payload.mode}) enviado para ${sent} destinatário(s) de ${orgType}:${orgId}`,
    )

    return { sent, weekKey, mode: payload.mode }
  }
}
