import { InjectQueue } from '@nestjs/bullmq'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrgType, ShareCardFormat } from '@prisma/client'
import {
  MIN_CELL_SIZE,
  RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
  computePercentileFromBuckets,
  getPlanConfig,
  normalizePersonName,
} from '@votz/shared-types'
import { Queue } from 'bullmq'
import { createHash } from 'crypto'
import {
  addDaysDateString,
  diffDaysBetweenStrings,
  toSaoPauloDateString,
} from '../analytics/analytics.constants'
import { AnalyticsRepository } from '../analytics/analytics.repository'
import {
  AnalyticsScopeService,
  resolvePoliticianTerritory,
} from '../analytics/analytics.scope'
import { ActingUser } from '../auth/acting-org'
import { recordOrgAudit } from '../common/audit/org-audit'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { GenerateShareCardDto } from './dto/share-card.dto'
import { ShareCardRendererService } from './share-card-renderer.service'

export const SHARE_CARDS_QUEUE = 'share-cards'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Injectable()
export class ShareCardsService {
  private readonly logger = new Logger(ShareCardsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: AnalyticsScopeService,
    private readonly analyticsRepo: AnalyticsRepository,
    private readonly renderer: ShareCardRendererService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @InjectQueue(SHARE_CARDS_QUEUE) private readonly queue: Queue,
  ) {}

  defaultPeriod(): { from: string; to: string } {
    const to = toSaoPauloDateString(new Date())
    const from = addDaysDateString(to, -29)
    return { from, to }
  }

  private normalizePeriod(from?: string, to?: string): { from: string; to: string } {
    const def = this.defaultPeriod()
    const fromStr = (from ?? def.from).slice(0, 10)
    const toStr = (to ?? def.to).slice(0, 10)
    const span = diffDaysBetweenStrings(fromStr, toStr) + 1
    if (!Number.isFinite(span) || span <= 0 || span > 366) {
      throw new BadRequestException('Período deve estar entre 1 e 366 dias')
    }
    return { from: fromStr, to: toStr }
  }

  async resolvePoliticianBySlugOrId(slugOrId: string) {
    const trimmed = slugOrId.trim()
    if (!trimmed) throw new NotFoundException('Mandato não encontrado')

    const polSelect = {
      id: true,
      name: true,
      office: true,
      state: true,
      city: true,
      party: { select: { abbreviation: true } },
      plan: true,
      status: true,
    } as const

    if (UUID_REGEX.test(trimmed)) {
      const byId = await this.prisma.politician.findUnique({
        where: { id: trimmed },
        select: polSelect,
      })
      if (!byId) {
        throw new NotFoundException('Mandato não encontrado')
      }
      return byId
    }

    const normalizedTarget = normalizePersonName(trimmed.replace(/-/g, ' '))
    const candidates = await this.prisma.politician.findMany({
      select: polSelect,
      take: 250,
    })

    const matched = candidates.find(
      (p) =>
        normalizePersonName(p.name) === normalizedTarget ||
        normalizePersonName(p.name).replace(/\s+/g, '-') === trimmed.toLowerCase(),
    )
    if (!matched) {
      throw new NotFoundException('Mandato não encontrado')
    }
    return matched
  }

  async computePublicMandateMetrics(politicianId: string, fromStr: string, toStr: string) {
    const pol = await this.prisma.politician.findUnique({
      where: { id: politicianId },
      select: {
        id: true,
        name: true,
        office: true,
        state: true,
        city: true,
        party: { select: { abbreviation: true } },
        status: true,
      },
    })
    if (!pol) {
      throw new NotFoundException('Mandato não encontrado')
    }

    const territory = resolvePoliticianTerritory({
      office: pol.office,
      state: pol.state,
      city: pol.city,
    })

    const matureCutoffDay = addDaysDateString(toSaoPauloDateString(new Date()), -7)
    const summary = await this.analyticsRepo.fetchAreaSummary(
      {
        state: territory.state,
        cityKey: territory.cityKey,
        from: fromStr,
        to: toStr,
      },
      matureCutoffDay,
    )

    const suppressed = summary.createdCount < MIN_CELL_SIZE
    const medianResponseHours =
      !suppressed && summary.responseCount > 0
        ? computePercentileFromBuckets(
            summary.respBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            0.5,
          )
        : null

    const territoryLabel = territory.cityKey
      ? `${territory.cityKey.split('|')[0]} / ${territory.state}`
      : territory.state

    const partyAbbr = pol.party?.abbreviation ?? null
    const roleLabel = `${pol.office}${partyAbbr ? ` (${partyAbbr})` : ''}`
    const appUrl = (this.config.get<string>('APP_URL') ?? 'https://votz.org.br').replace(/\/$/, '')
    const publicPath = `/p/${pol.id}/mandato`
    const publicUrl = `${appUrl.replace(/^https?:\/\//, '')}${publicPath}`

    const payloadForHash = {
      name: pol.name,
      roleLabel,
      territoryLabel,
      periodStart: fromStr,
      periodEnd: toStr,
      received: suppressed ? -1 : summary.createdCount,
      resolved: suppressed ? -1 : summary.resolvedCount,
      medianResponseHours: suppressed ? null : medianResponseHours,
      suppressed,
    }
    const metricsHash = createHash('sha256')
      .update(JSON.stringify(payloadForHash))
      .digest('hex')
      .slice(0, 16)

    return {
      politician: pol,
      roleLabel,
      territoryLabel,
      periodStart: fromStr,
      periodEnd: toStr,
      received: summary.createdCount,
      resolved: summary.resolvedCount,
      medianResponseHours,
      suppressed,
      metricsHash,
      publicUrl,
      publicPath,
      appUrl,
    }
  }

  private buildObjectKey(
    politicianId: string,
    format: ShareCardFormat,
    fromStr: string,
    toStr: string,
    metricsHash: string,
  ): string {
    return `share-cards/${politicianId}/${format.toLowerCase()}-${fromStr}-${toStr}-${metricsHash}.png`
  }

  private async ensureRenderedCard(
    politicianId: string,
    format: ShareCardFormat,
    fromStr: string,
    toStr: string,
  ): Promise<{ buffer: Buffer; key: string; metricsHash: string; cacheHit: boolean }> {
    const metrics = await this.computePublicMandateMetrics(politicianId, fromStr, toStr)
    const existing = await this.prisma.shareCardCache.findUnique({
      where: {
        politicianId_format_periodStart_periodEnd_metricsHash: {
          politicianId,
          format,
          periodStart: fromStr,
          periodEnd: toStr,
          metricsHash: metrics.metricsHash,
        },
      },
    })

    if (existing) {
      try {
        const buffer = await this.storage.getObjectBuffer(existing.imageKey)
        if (buffer && buffer.length > 0) {
          return {
            buffer,
            key: existing.imageKey,
            metricsHash: existing.metricsHash,
            cacheHit: true,
          }
        }
      } catch {
        // Fallback: re-render if cache object was pruned from storage
      }
    }

    const buffer = await this.renderer.renderPng({
      format,
      politicianName: metrics.politician.name,
      roleLabel: metrics.roleLabel,
      territoryLabel: metrics.territoryLabel,
      periodStart: fromStr,
      periodEnd: toStr,
      received: metrics.received,
      resolved: metrics.resolved,
      medianResponseHours: metrics.medianResponseHours,
      suppressed: metrics.suppressed,
      publicUrl: metrics.publicUrl,
    })

    const key = this.buildObjectKey(politicianId, format, fromStr, toStr, metrics.metricsHash)
    await this.storage.uploadBuffer(key, buffer, 'image/png', false)

    await this.prisma.shareCardCache.upsert({
      where: {
        politicianId_format_periodStart_periodEnd_metricsHash: {
          politicianId,
          format,
          periodStart: fromStr,
          periodEnd: toStr,
          metricsHash: metrics.metricsHash,
        },
      },
      create: {
        politicianId,
        format,
        periodStart: fromStr,
        periodEnd: toStr,
        metricsHash: metrics.metricsHash,
        imageKey: key,
      },
      update: {
        imageKey: key,
      },
    })

    return { buffer, key, metricsHash: metrics.metricsHash, cacheHit: false }
  }

  async listCards(user: ActingUser) {
    const scope = await this.scopeService.resolveOrgScope(user, {})
    if (scope.orgType !== 'POLITICIAN') {
      return { items: [], quota: null }
    }

    const planCfg = getPlanConfig(scope.orgType, scope.plan)
    const monthlyLimit = planCfg?.limits.maxShareCardsPerMonth ?? null
    const todaySp = toSaoPauloDateString(new Date())
    const monthStart = new Date(`${todaySp.slice(0, 7)}-01T03:00:00.000Z`)

    const [items, usedThisMonth] = await Promise.all([
      this.prisma.shareCardCache.findMany({
        where: { politicianId: scope.orgId },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.shareCardCache.count({
        where: { politicianId: scope.orgId, createdAt: { gte: monthStart } },
      }),
    ])

    return {
      items: items.map((item) => ({
        id: item.id,
        format: item.format,
        periodStart: item.periodStart,
        periodEnd: item.periodEnd,
        metricsHash: item.metricsHash,
        createdAt: item.createdAt,
        imageUrl: `/api/v1/share-cards/public/${scope.orgId}/image?format=${item.format}&from=${item.periodStart}&to=${item.periodEnd}`,
        publicPageUrl: `/p/${scope.orgId}/mandato`,
      })),
      quota: {
        usedThisMonth,
        monthlyLimit,
      },
    }
  }

  async generateCard(user: ActingUser, dto: GenerateShareCardDto) {
    const scope = await this.scopeService.resolveOrgScope(user, {})
    if (scope.orgType !== 'POLITICIAN') {
      throw new ForbiddenException('Cartões compartilháveis são exclusivos para contas de mandato')
    }

    const format = dto.format ?? ShareCardFormat.FEED
    const { from, to } = this.normalizePeriod(dto.from, dto.to)
    const metrics = await this.computePublicMandateMetrics(scope.orgId, from, to)

    const existing = await this.prisma.shareCardCache.findUnique({
      where: {
        politicianId_format_periodStart_periodEnd_metricsHash: {
          politicianId: scope.orgId,
          format,
          periodStart: from,
          periodEnd: to,
          metricsHash: metrics.metricsHash,
        },
      },
    })

    if (!existing) {
      const planCfg = getPlanConfig(scope.orgType, scope.plan)
      const monthlyLimit = planCfg?.limits.maxShareCardsPerMonth ?? 0
      if (monthlyLimit !== null) {
        const todaySp = toSaoPauloDateString(new Date())
        const monthStart = new Date(`${todaySp.slice(0, 7)}-01T03:00:00.000Z`)
        const used = await this.prisma.shareCardCache.count({
          where: { politicianId: scope.orgId, createdAt: { gte: monthStart } },
        })
        if (used >= monthlyLimit) {
          throw new ForbiddenException(
            `Limite mensal de ${monthlyLimit} cartões compartilháveis atingido para o plano atual.`,
          )
        }
      }
    }

    const rendered = await this.ensureRenderedCard(scope.orgId, format, from, to)
    if (!rendered.cacheHit) {
      await recordOrgAudit(this.prisma, {
        action: 'CREATED',
        orgType: OrgType.POLITICIAN,
        orgId: scope.orgId,
        itemType: 'SHARE_CARD',
        itemId: `${format}:${from}:${to}:${rendered.metricsHash}`,
        actorId: user.id,
        summary: `Cartão ${format} (${from} a ${to})`,
      })
    }

    return {
      politicianId: scope.orgId,
      format,
      periodStart: from,
      periodEnd: to,
      metricsHash: rendered.metricsHash,
      cached: rendered.cacheHit,
      imageUrl: `/api/v1/share-cards/public/${scope.orgId}/image?format=${format}&from=${from}&to=${to}`,
      publicPageUrl: metrics.publicPath,
      ogUrl: `/api/v1/share-cards/public/${scope.orgId}/og?format=${format}&from=${from}&to=${to}`,
    }
  }

  async getPublicMeta(slugOrId: string, from?: string, to?: string) {
    const pol = await this.resolvePoliticianBySlugOrId(slugOrId)
    const period = this.normalizePeriod(from, to)
    const metrics = await this.computePublicMandateMetrics(pol.id, period.from, period.to)

    return {
      politician: {
        id: pol.id,
        name: pol.name,
        office: pol.office,
        state: pol.state,
        city: pol.city,
        party: pol.party?.abbreviation ?? null,
      },
      roleLabel: metrics.roleLabel,
      territoryLabel: metrics.territoryLabel,
      periodStart: metrics.periodStart,
      periodEnd: metrics.periodEnd,
      metrics: {
        received: metrics.suppressed ? null : metrics.received,
        resolved: metrics.suppressed ? null : metrics.resolved,
        medianResponseHours: metrics.medianResponseHours,
        suppressed: metrics.suppressed,
      },
      metricsHash: metrics.metricsHash,
      images: {
        feed: `/api/v1/share-cards/public/${pol.id}/image?format=FEED&from=${period.from}&to=${period.to}`,
        stories: `/api/v1/share-cards/public/${pol.id}/image?format=STORIES&from=${period.from}&to=${period.to}`,
      },
      verificationNote:
        'Dados públicos verificáveis gerados automaticamente a partir dos rollups oficiais do Votz, sem dados pessoais de cidadãos.',
    }
  }

  async renderOrFetchPublicImage(
    slugOrId: string,
    format: ShareCardFormat = ShareCardFormat.FEED,
    from?: string,
    to?: string,
  ): Promise<Buffer> {
    const pol = await this.resolvePoliticianBySlugOrId(slugOrId)
    const period = this.normalizePeriod(from, to)
    const rendered = await this.ensureRenderedCard(pol.id, format, period.from, period.to)
    return rendered.buffer
  }

  async renderOgHtml(
    slugOrId: string,
    format: ShareCardFormat = ShareCardFormat.FEED,
    from?: string,
    to?: string,
  ): Promise<string> {
    const pol = await this.resolvePoliticianBySlugOrId(slugOrId)
    const period = this.normalizePeriod(from, to)
    const metrics = await this.computePublicMandateMetrics(pol.id, period.from, period.to)

    const escapeHtml = (v: string) =>
      v
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

    const title = escapeHtml(`${pol.name} · Dados públicos do mandato | Votz`)
    const desc = metrics.suppressed
      ? escapeHtml(
          `${metrics.roleLabel} em ${metrics.territoryLabel}. Dados públicos verificáveis no Votz.`,
        )
      : escapeHtml(
          `${metrics.roleLabel} (${metrics.territoryLabel}): ${metrics.received} relatos recebidos e ${metrics.resolved} resolvidos entre ${period.from} e ${period.to}.`,
        )

    const imageUrl = `${metrics.appUrl}/api/v1/share-cards/public/${pol.id}/image?format=${format}&from=${period.from}&to=${period.to}`
    const targetUrl = `${metrics.appUrl}/p/${pol.id}/mandato`
    const isStories = format === ShareCardFormat.STORIES

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:width" content="1080" />
  <meta property="og:image:height" content="${isStories ? '1920' : '1350'}" />
  <meta property="og:url" content="${escapeHtml(targetUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(targetUrl)}" />
</head>
<body>
  <p><a href="${escapeHtml(targetUrl)}">Ver página pública do mandato no Votz</a></p>
</body>
</html>`
  }

  async invalidateOnMetricChange(politicianId: string) {
    try {
      await this.queue.add(
        'refresh-politician-cards',
        { politicianId },
        {
          jobId: `refresh-cards:${politicianId}:${toSaoPauloDateString(new Date())}`,
          removeOnComplete: 50,
          removeOnFail: 20,
        },
      )
    } catch (err) {
      this.logger.warn(`Falha ao enfileirar refresh de cartões para ${politicianId}: ${err}`)
    }
  }

  async refreshRecentCardsForPolitician(politicianId: string) {
    const recent = await this.prisma.shareCardCache.findMany({
      where: { politicianId },
      orderBy: { createdAt: 'desc' },
      take: 4,
    })

    for (const item of recent) {
      await this.ensureRenderedCard(
        politicianId,
        item.format,
        item.periodStart,
        item.periodEnd,
      )
    }
  }
}
