import { createHash } from 'crypto'
import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { Category, RecipientType } from '@prisma/client'
import type Redis from 'ioredis'
import {
  ANALYTICS_DEFINITION_DATE,
  ANALYTICS_DEFINITION_VERSION,
  ANALYTICS_TIMEZONE,
  MIN_CELL_SIZE,
  PRESSURE_BUCKET_BOUNDS,
  RECURRENCE_WINDOW_DAYS,
  RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
  RESPONSE_TIME_BUCKET_LABELS,
  computePercentileFromBuckets,
  decodeGeohashBounds,
  hasConfiguredOwnSla,
  normalizeLocationKey,
} from '@votz/shared-types'
import { ActingUser } from '../auth/acting-org'
import {
  ANALYTICS_CACHE_EPOCH_KEY,
  ANALYTICS_CACHE_TTL_SECONDS,
  RatioValue,
  addDaysDateString,
  buildRatio,
  computeTrendComparison,
  diffDaysBetweenStrings,
  sumBucketArrays,
  toSaoPauloDateString,
} from './analytics.constants'
import {
  AnalyticsRepository,
  AreaQueryFilter,
  DailySeriesRow,
  DirectedQueryFilter,
  OpenByDayRow,
  SummaryRollupRow,
} from './analytics.repository'
import { ANALYTICS_REDIS_CLIENT } from './analytics.rollup'
import { AnalyticsScopeService, ResolvedTerritorialScope } from './analytics.scope'
import {
  AnalyticsScopeMode,
  BaseAnalyticsFilterDto,
  ExportAnalyticsQueryDto,
  ExportFormat,
  PaginatedAnalyticsQueryDto,
  PeriodPreset,
  PublicMunicipalityAnalyticsDto,
  PublicOrgAnalyticsDto,
  TimeseriesGranularity,
  TimeseriesMetric,
  TimeseriesQueryDto,
} from './dto/analytics-query.dto'

export interface AnalyticsMeta {
  computedAt: string
  sampleSize: number | null
  minCellSize: number
  suppressed: boolean
  definitionVersion: string
  definitionDate: string
  timezone: string
  period: { from: string; to: string }
  scope: {
    mode: AnalyticsScopeMode
    orgType: 'ENTITY' | 'POLITICIAN'
    territoryLevel: 'CITY' | 'STATE'
    state: string
    cityKey: string | null
  }
}

export interface PeerComparisonResult {
  available: false
  status: 'soon'
  feature: 'peer_comparison'
  reason: 'POPULATION_DATA_UNAVAILABLE'
  message: string
  populationBrackets: Array<{ code: string; label: string; minPop: number; maxPop: number | null }>
  minPeersRequired: number
  percentiles: null
  computedAt: string
  definitionVersion: string
}

export const PEER_POPULATION_BRACKETS = [
  { code: 'UP_TO_50K', label: 'Até 50 mil habitantes', minPop: 0, maxPop: 50_000 },
  { code: 'FROM_50K_TO_300K', label: '50 mil a 300 mil habitantes', minPop: 50_001, maxPop: 300_000 },
  { code: 'OVER_300K', label: 'Acima de 300 mil habitantes', minPop: 300_001, maxPop: null },
] as const

export const PEER_MIN_MUNICIPALITIES = 5

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly scopeService: AnalyticsScopeService,
    @Optional() @Inject(ANALYTICS_REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  private buildFiltersForScope(
    scope: ResolvedTerritorialScope,
    from: string,
    to: string,
    category?: Category,
  ): { mode: 'area' | 'directed'; areaFilter: AreaQueryFilter | null; directedFilter: DirectedQueryFilter | null } {
    if (scope.scopeMode === AnalyticsScopeMode.DIRECTED) {
      return {
        mode: 'directed',
        areaFilter: null,
        directedFilter: {
          recipientType: scope.recipientType,
          recipientId: scope.orgId,
          from,
          to,
          category,
        },
      }
    }
    return {
      mode: 'area',
      areaFilter: {
        state: scope.state,
        cityKey: scope.cityKey,
        from,
        to,
        category,
        cell7: scope.cellFilter,
      },
      directedFilter: null,
    }
  }

  private async fetchSummaryByScope(
    scope: ResolvedTerritorialScope,
    from: string,
    to: string,
    category?: Category,
    matureCutoffDay?: string,
  ): Promise<SummaryRollupRow> {
    const cutoff = matureCutoffDay ?? addDaysDateString(toSaoPauloDateString(new Date()), -7)
    const { mode, areaFilter, directedFilter } = this.buildFiltersForScope(scope, from, to, category)
    if (mode === 'area' && areaFilter) {
      return this.repository.fetchAreaSummary(areaFilter, cutoff)
    }
    if (directedFilter) {
      return this.repository.fetchDirectedSummary(directedFilter, cutoff)
    }
    return this.repository.fetchAreaSummary(
      { state: scope.state, cityKey: scope.cityKey, from, to, category },
      cutoff,
    )
  }

  private computeOpenAgePercentilesHours(
    openByDay: OpenByDayRow[],
    todayStr: string,
  ): { p50: number | null; p90: number | null } {
    const total = openByDay.reduce((sum, row) => sum + row.openCurrentCount, 0)
    if (total === 0) return { p50: null, p90: null }

    const todayMs = Date.parse(`${todayStr}T12:00:00Z`)
    // Ordem crescente de idade: dias mais recentes primeiro
    const sorted = [...openByDay].sort((a, b) => (a.day > b.day ? -1 : a.day < b.day ? 1 : 0))
    const pick = (percentile: number): number => {
      const target = Math.max(1, Math.ceil((percentile / 100) * total))
      let acc = 0
      for (const row of sorted) {
        acc += row.openCurrentCount
        if (acc >= target) {
          const dayMs = Date.parse(`${row.day}T00:00:00Z`)
          return Number(Math.max(1, (todayMs - dayMs) / 3_600_000).toFixed(2))
        }
      }
      const oldestMs = Date.parse(`${sorted[sorted.length - 1].day}T00:00:00Z`)
      return Number(Math.max(1, (todayMs - oldestMs) / 3_600_000).toFixed(2))
    }

    return { p50: pick(50), p90: pick(90) }
  }

  private buildMeta(scope: ResolvedTerritorialScope, sampleSize: number, suppressed: boolean): AnalyticsMeta {
    return {
      computedAt: new Date().toISOString(),
      sampleSize: sampleSize >= MIN_CELL_SIZE ? sampleSize : null,
      minCellSize: MIN_CELL_SIZE,
      suppressed,
      definitionVersion: ANALYTICS_DEFINITION_VERSION,
      definitionDate: ANALYTICS_DEFINITION_DATE,
      timezone: ANALYTICS_TIMEZONE,
      period: { from: scope.from, to: scope.to },
      scope: {
        mode: scope.scopeMode,
        orgType: scope.orgType,
        territoryLevel: scope.territoryLevel,
        state: scope.state,
        cityKey: scope.cityKey,
      },
    }
  }

  private async getCacheEpoch(): Promise<string> {
    if (!this.redis) return '0'
    try {
      const val = await this.redis.get(ANALYTICS_CACHE_EPOCH_KEY)
      return val ?? '0'
    } catch {
      return '0'
    }
  }

  private async withCache<T>(keyPrefix: string, parts: unknown, loader: () => Promise<T>): Promise<T> {
    if (!this.redis) return loader()
    try {
      const epoch = await this.getCacheEpoch()
      const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
      const cacheKey = `analytics:v1:${epoch}:${keyPrefix}:${digest}`
      const hit = await this.redis.get(cacheKey)
      if (hit) {
        return JSON.parse(hit) as T
      }
      const result = await loader()
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', ANALYTICS_CACHE_TTL_SECONDS)
      return result
    } catch (err) {
      this.logger.warn(`Cache analytics indisponível (${keyPrefix}): ${(err as Error).message}`)
      return loader()
    }
  }

  async getOverview(user: ActingUser, query: BaseAnalyticsFilterDto) {
    const scope = await this.scopeService.resolveOrgScope(user, query)
    return this.withCache('overview', { scope, category: query.category ?? null }, async () => {
      const todayStr = toSaoPauloDateString(new Date())
      const matureCutoff = addDaysDateString(todayStr, -7)
      const { mode, areaFilter, directedFilter } = this.buildFiltersForScope(
        scope,
        scope.from,
        scope.to,
        query.category,
      )

      const [summary, openByDay, topPressureCells] = await Promise.all([
        this.fetchSummaryByScope(scope, scope.from, scope.to, query.category, matureCutoff),
        this.repository.fetchOpenByDay(mode, areaFilter, directedFilter),
        mode === 'area' && areaFilter
          ? this.repository.fetchTopPressureCells(areaFilter, 5)
          : Promise.resolve([]),
      ])

      const suppressed = summary.createdCount < MIN_CELL_SIZE
      const meta = this.buildMeta(scope, summary.createdCount, suppressed)

      const buildWindowTrend = async (days: number) => {
        if (scope.historyDays !== null && days * 2 > scope.historyDays) {
          return { available: false, days, requiresFullHistory: true }
        }
        const curStart = addDaysDateString(todayStr, -(days - 1))
        const prevEnd = addDaysDateString(curStart, -1)
        const prevStart = addDaysDateString(prevEnd, -(days - 1))
        const [cur, prev] = await Promise.all([
          this.fetchSummaryByScope(scope, curStart, todayStr, query.category, matureCutoff),
          this.fetchSummaryByScope(scope, prevStart, prevEnd, query.category, matureCutoff),
        ])
        if (cur.createdCount < MIN_CELL_SIZE || prev.createdCount < MIN_CELL_SIZE) {
          return {
            available: true,
            days,
            suppressed: true,
            current: null,
            previous: null,
            deltaPercent: null,
            smallBaseWarning: true,
          }
        }
        return {
          available: true,
          days,
          suppressed: false,
          ...computeTrendComparison(cur.createdCount, prev.createdCount),
        }
      }

      const [trend7d, trend30d, trend90d] = await Promise.all([
        buildWindowTrend(7),
        buildWindowTrend(30),
        buildWindowTrend(90),
      ])

      if (suppressed) {
        return {
          ...meta,
          kpis: {
            volume: null,
            resolutionRate: { value: null, numerator: 0, denominator: 0, suppressed: true },
            responseRate: { value: null, numerator: 0, denominator: 0, suppressed: true },
            firstResponseMedianH: null,
            firstResponseP90H: null,
            resolutionTimeMedianH: null,
            resolutionTimeP90H: null,
            backlog: null,
            backlogAgeP50H: null,
            backlogAgeP90H: null,
            contestRate: { value: null, numerator: 0, denominator: 0, suppressed: true },
            pressureP50: null,
            pressureP90: null,
            supportVolume: null,
            commentVolume: null,
          },
          trends: { d7: trend7d, d30: trend30d, d90: trend90d },
          topPressureCells: [],
        }
      }

      const backlogAges = this.computeOpenAgePercentilesHours(openByDay, todayStr)

      return {
        ...meta,
        kpis: {
          volume: summary.createdCount,
          resolutionRate: buildRatio(
            summary.resolvedCount,
            summary.resolvedCount + summary.openOver7dCount,
            100,
          ),
          responseRate: buildRatio(summary.responseCount, summary.createdCount, 100),
          firstResponseMedianH: computePercentileFromBuckets(
            summary.respBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            50,
          ),
          firstResponseP90H: computePercentileFromBuckets(
            summary.respBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            90,
          ),
          resolutionTimeMedianH: computePercentileFromBuckets(
            summary.resBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            50,
          ),
          resolutionTimeP90H: computePercentileFromBuckets(
            summary.resBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            90,
          ),
          backlog: summary.openCurrentCount,
          backlogAgeP50H: backlogAges.p50,
          backlogAgeP90H: backlogAges.p90,
          contestRate: buildRatio(
            summary.contestedCount,
            summary.resolvedCount + summary.contestedCount,
            100,
          ),
          pressureP50: computePercentileFromBuckets(summary.pressureBuckets, PRESSURE_BUCKET_BOUNDS, 50),
          pressureP90: computePercentileFromBuckets(summary.pressureBuckets, PRESSURE_BUCKET_BOUNDS, 90),
          supportVolume: summary.supportCount,
          commentVolume: summary.commentCount,
        },
        trends: { d7: trend7d, d30: trend30d, d90: trend90d },
        topPressureCells,
      }
    })
  }

  async getCategories(user: ActingUser, query: BaseAnalyticsFilterDto) {
    const scope = await this.scopeService.resolveOrgScope(user, query)
    return this.withCache('categories', { scope, category: query.category ?? null }, async () => {
      const todayStr = toSaoPauloDateString(new Date())
      const matureCutoff = addDaysDateString(todayStr, -7)
      const { mode, areaFilter, directedFilter } = this.buildFiltersForScope(
        scope,
        scope.from,
        scope.to,
        query.category,
      )

      const rows = await this.repository.fetchCategoryBreakdown(
        mode,
        areaFilter,
        directedFilter,
        matureCutoff,
      )

      const totalVolume = rows.reduce((sum, r) => sum + r.createdCount, 0)
      const suppressedAll = totalVolume < MIN_CELL_SIZE
      const meta = this.buildMeta(scope, totalVolume, suppressedAll)

      const items = rows.map((row) => {
        const suppressed = row.createdCount < MIN_CELL_SIZE
        if (suppressed) {
          return {
            category: row.category,
            suppressed: true,
            volume: null,
            share: { value: null, numerator: 0, denominator: totalVolume },
            resolutionRate: { value: null, numerator: 0, denominator: 0 },
            responseRate: { value: null, numerator: 0, denominator: 0 },
            firstResponseMedianH: null,
            resolutionTimeMedianH: null,
            backlog: null,
            supportVolume: null,
            commentVolume: null,
          }
        }
        return {
          category: row.category,
          suppressed: false,
          volume: row.createdCount,
          share: buildRatio(row.createdCount, totalVolume, 100),
          resolutionRate: buildRatio(row.resolvedCount, row.resolvedCount + row.openOver7dCount, 100),
          responseRate: buildRatio(row.responseCount, row.createdCount, 100),
          firstResponseMedianH: computePercentileFromBuckets(
            row.respBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            50,
          ),
          resolutionTimeMedianH: computePercentileFromBuckets(
            row.resBuckets,
            RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
            50,
          ),
          backlog: row.openCurrentCount,
          supportVolume: row.supportCount,
          commentVolume: row.commentCount,
        }
      })

      return {
        ...meta,
        items,
        suppressedCategoriesCount: rows.filter((r) => r.createdCount < MIN_CELL_SIZE).length,
      }
    })
  }

  private bucketKeyForDate(dayStr: string, granularity: TimeseriesGranularity): string {
    if (granularity === TimeseriesGranularity.DAY) return dayStr
    if (granularity === TimeseriesGranularity.MONTH) return dayStr.slice(0, 7)
    const [y, m, d] = dayStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    const dow = dt.getUTCDay() // 0=Sun..6=Sat
    const diffToMonday = dow === 0 ? -6 : 1 - dow
    dt.setUTCDate(dt.getUTCDate() + diffToMonday)
    return dt.toISOString().slice(0, 10)
  }

  private aggregateSeries(
    dailyRows: DailySeriesRow[],
    metric: TimeseriesMetric,
    granularity: TimeseriesGranularity,
  ) {
    const map = new Map<
      string,
      {
        bucket: string
        createdCount: number
        resolvedCount: number
        openOver7dCount: number
        responseCount: number
        supportCount: number
        commentCount: number
      }
    >()

    for (const row of dailyRows) {
      const key = this.bucketKeyForDate(row.day, granularity)
      let acc = map.get(key)
      if (!acc) {
        acc = {
          bucket: key,
          createdCount: 0,
          resolvedCount: 0,
          openOver7dCount: 0,
          responseCount: 0,
          supportCount: 0,
          commentCount: 0,
        }
        map.set(key, acc)
      }
      acc.createdCount += row.createdCount
      acc.resolvedCount += row.resolvedCount
      acc.openOver7dCount += row.openOver7dCount
      acc.responseCount += row.responseCount
      acc.supportCount += row.supportCount
      acc.commentCount += row.commentCount
    }

    return Array.from(map.values())
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .map((acc) => {
        const suppressed = acc.createdCount < MIN_CELL_SIZE
        let ratio: RatioValue | null = null
        let value: number | null = null

        if (!suppressed) {
          switch (metric) {
            case TimeseriesMetric.VOLUME:
              value = acc.createdCount
              break
            case TimeseriesMetric.RESOLVED:
              value = acc.resolvedCount
              break
            case TimeseriesMetric.SUPPORT:
              value = acc.supportCount
              break
            case TimeseriesMetric.COMMENTS:
              value = acc.commentCount
              break
            case TimeseriesMetric.RESPONSE_RATE:
              ratio = buildRatio(acc.responseCount, acc.createdCount, 100)
              value = ratio.value
              break
            case TimeseriesMetric.RESOLUTION_RATE:
              ratio = buildRatio(acc.resolvedCount, acc.resolvedCount + acc.openOver7dCount, 100)
              value = ratio.value
              break
          }
        }

        return {
          bucket: acc.bucket,
          suppressed,
          value,
          ...(ratio ? { numerator: suppressed ? 0 : ratio.numerator, denominator: suppressed ? 0 : ratio.denominator } : {}),
        }
      })
  }

  async getTimeseries(user: ActingUser, query: TimeseriesQueryDto) {
    const scope = await this.scopeService.resolveOrgScope(user, query)
    const metric = query.metric ?? TimeseriesMetric.VOLUME
    const granularity = query.granularity ?? TimeseriesGranularity.DAY

    return this.withCache(
      'timeseries',
      { scope, category: query.category ?? null, metric, granularity },
      async () => {
        const todayStr = toSaoPauloDateString(new Date())
        const matureCutoff = addDaysDateString(todayStr, -7)
        const spanDays = diffDaysBetweenStrings(scope.from, scope.to) + 1
        const prevEnd = addDaysDateString(scope.from, -1)
        const prevStart = addDaysDateString(prevEnd, -(spanDays - 1))

        const curFilters = this.buildFiltersForScope(scope, scope.from, scope.to, query.category)
        const prevFilters = this.buildFiltersForScope(scope, prevStart, prevEnd, query.category)

        const [curRows, prevSummary] = await Promise.all([
          this.repository.fetchDailySeries(
            curFilters.mode,
            curFilters.areaFilter,
            curFilters.directedFilter,
            matureCutoff,
          ),
          this.fetchSummaryByScope(scope, prevStart, prevEnd, query.category, matureCutoff),
        ])

        const totalVolume = curRows.reduce((sum, r) => sum + r.createdCount, 0)
        const points = this.aggregateSeries(curRows, metric, granularity)

        const currentTotalValue =
          metric === TimeseriesMetric.RESOLVED
            ? curRows.reduce((s, r) => s + r.resolvedCount, 0)
            : metric === TimeseriesMetric.SUPPORT
              ? curRows.reduce((s, r) => s + r.supportCount, 0)
              : metric === TimeseriesMetric.COMMENTS
                ? curRows.reduce((s, r) => s + r.commentCount, 0)
                : totalVolume

        const previousTotalValue =
          metric === TimeseriesMetric.RESOLVED
            ? prevSummary.resolvedCount
            : metric === TimeseriesMetric.SUPPORT
              ? prevSummary.supportCount
              : metric === TimeseriesMetric.COMMENTS
                ? prevSummary.commentCount
                : prevSummary.createdCount

        const suppressed = totalVolume < MIN_CELL_SIZE
        const meta = this.buildMeta(scope, totalVolume, suppressed)

        const comparisonSuppressed = suppressed || prevSummary.createdCount < MIN_CELL_SIZE

        return {
          ...meta,
          metric,
          granularity,
          points,
          comparison: comparisonSuppressed
            ? {
                previousPeriod: { from: prevStart, to: prevEnd },
                current: null,
                previous: null,
                deltaPercent: null,
                smallBaseWarning: true,
                suppressed: true,
              }
            : {
                previousPeriod: { from: prevStart, to: prevEnd },
                ...computeTrendComparison(currentTotalValue, previousTotalValue),
                suppressed: false,
              },
        }
      },
    )
  }

  async getHeatmap(user: ActingUser, query: BaseAnalyticsFilterDto) {
    const scope = await this.scopeService.resolveOrgScope(user, query, { forceTerritory: true })
    return this.withCache('heatmap', { scope, category: query.category ?? null }, async () => {
      const areaFilter: AreaQueryFilter = {
        state: scope.state,
        cityKey: scope.cityKey,
        from: scope.from,
        to: scope.to,
        category: query.category,
        cell7: scope.cellFilter,
      }

      const { visibleCells, suppressedCellsCount, suppressedVolume } =
        await this.repository.fetchHeatmapCells(areaFilter)

      const maxCount = visibleCells.reduce((m, c) => Math.max(m, c.createdCount), 0)
      const totalVisible = visibleCells.reduce((s, c) => s + c.createdCount, 0)
      const totalSample = totalVisible + suppressedVolume
      const meta = this.buildMeta(scope, totalSample, visibleCells.length === 0)

      const cells = visibleCells
        .map((c) => {
          const bounds = decodeGeohashBounds(c.cell7)
          if (!bounds) return null
          return {
            cell7: c.cell7,
            cityDisplay: c.cityDisplay,
            bounds: {
              minLat: Number(bounds.minLat.toFixed(6)),
              maxLat: Number(bounds.maxLat.toFixed(6)),
              minLng: Number(bounds.minLng.toFixed(6)),
              maxLng: Number(bounds.maxLng.toFixed(6)),
              centerLat: Number(bounds.centerLat.toFixed(6)),
              centerLng: Number(bounds.centerLng.toFixed(6)),
            },
            count: c.createdCount,
            openCount: c.openCurrentCount,
            resolvedCount: c.resolvedCount,
            contestedCount: c.contestedCount,
            avgPressure: Number((c.pressureSum / Math.max(1, c.createdCount)).toFixed(2)),
            supportCount: c.supportCount,
            intensity: maxCount > 0 ? Number((c.createdCount / maxCount).toFixed(3)) : 0,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      return {
        ...meta,
        precision: 7,
        cells,
        suppressedCells: suppressedCellsCount,
      }
    })
  }

  async getRecurrence(user: ActingUser, query: PaginatedAnalyticsQueryDto) {
    const scope = await this.scopeService.resolveOrgScope(user, query, { forceTerritory: true })
    const page = query.page ?? 1
    const limit = query.limit ?? 25

    return this.withCache(
      'recurrence',
      { scope, category: query.category ?? null, page, limit },
      async () => {
        const windowData = await this.repository.fetchLatestRecurrenceWindow(
          scope.state,
          scope.cityKey,
          query.category,
        )

        const totalAll = windowData.total90dVolume
        const suppressedAll = totalAll < MIN_CELL_SIZE
        const meta = this.buildMeta(scope, totalAll, suppressedAll)

        const offset = (page - 1) * limit
        const sliced = windowData.visibleRows.slice(offset, offset + limit).map((row) => ({
          cell7: row.cell7,
          category: row.category,
          state: row.state,
          cityKey: row.cityKey,
          bounds: decodeGeohashBounds(row.cell7),
          count90d: row.count90d,
          firstSeen: row.firstSeen.toISOString(),
          lastSeen: row.lastSeen.toISOString(),
          avgGapDays: row.avgGapDays,
        }))

        const recurrenceIndex = suppressedAll
          ? { value: null, numerator: 0, denominator: 0 }
          : buildRatio(windowData.allRecurrentVolume, totalAll, 100)

        return {
          ...meta,
          windowDays: RECURRENCE_WINDOW_DAYS,
          windowEnd: windowData.windowEnd ? windowData.windowEnd.toISOString().slice(0, 10) : null,
          recurrenceIndex,
          totalRecurrentCells: windowData.allRecurrentCellsCount,
          suppressedCells: windowData.suppressedCellsCount,
          pagination: {
            page,
            limit,
            totalVisible: windowData.visibleTotal,
            totalPages: Math.max(1, Math.ceil(windowData.visibleTotal / limit)),
          },
          items: sliced,
        }
      },
    )
  }

  async getResponseTimes(user: ActingUser, query: BaseAnalyticsFilterDto) {
    const scope = await this.scopeService.resolveOrgScope(user, query)
    return this.withCache('response-times', { scope, category: query.category ?? null }, async () => {
      const todayStr = toSaoPauloDateString(new Date())
      const matureCutoff = addDaysDateString(todayStr, -7)
      const { mode, areaFilter, directedFilter } = this.buildFiltersForScope(
        scope,
        scope.from,
        scope.to,
        query.category,
      )

      const categoryRows = await this.repository.fetchCategoryBreakdown(
        mode,
        areaFilter,
        directedFilter,
        matureCutoff,
      )

      const totalVolume = categoryRows.reduce((s, r) => s + r.createdCount, 0)
      const overallRespBuckets = [0, 0, 0, 0, 0, 0, 0, 0]
      const overallResBuckets = [0, 0, 0, 0, 0, 0, 0, 0]
      let totalResponded = 0
      let totalResolved = 0

      for (const row of categoryRows) {
        sumBucketArrays(overallRespBuckets, row.respBuckets)
        sumBucketArrays(overallResBuckets, row.resBuckets)
        totalResponded += row.responseCount
        totalResolved += row.resolvedCount
      }

      const suppressedAll = totalVolume < MIN_CELL_SIZE
      const meta = this.buildMeta(scope, totalVolume, suppressedAll)

      return {
        ...meta,
        bucketLabels: RESPONSE_TIME_BUCKET_LABELS,
        overall: suppressedAll
          ? {
              suppressed: true,
              responseRate: { value: null, numerator: 0, denominator: 0 },
              firstResponseMedianH: null,
              firstResponseP90H: null,
              resolutionTimeMedianH: null,
              resolutionTimeP90H: null,
              firstResponseBuckets: RESPONSE_TIME_BUCKET_LABELS.map((label) => ({ label, count: null })),
              resolutionBuckets: RESPONSE_TIME_BUCKET_LABELS.map((label) => ({ label, count: null })),
            }
          : {
              suppressed: false,
              responseRate: buildRatio(totalResponded, totalVolume, 100),
              firstResponseMedianH: computePercentileFromBuckets(
                overallRespBuckets,
                RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
                50,
              ),
              firstResponseP90H: computePercentileFromBuckets(
                overallRespBuckets,
                RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
                90,
              ),
              resolutionTimeMedianH: computePercentileFromBuckets(
                overallResBuckets,
                RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
                50,
              ),
              resolutionTimeP90H: computePercentileFromBuckets(
                overallResBuckets,
                RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
                90,
              ),
              firstResponseBuckets: RESPONSE_TIME_BUCKET_LABELS.map((label, idx) => ({
                label,
                count: overallRespBuckets[idx] ?? 0,
              })),
              resolutionBuckets: RESPONSE_TIME_BUCKET_LABELS.map((label, idx) => ({
                label,
                count: overallResBuckets[idx] ?? 0,
              })),
            },
        byCategory: categoryRows.map((row) => {
          const suppressed = row.createdCount < MIN_CELL_SIZE
          if (suppressed) {
            return {
              category: row.category,
              suppressed: true,
              volume: null,
              responseRate: { value: null, numerator: 0, denominator: 0 },
              firstResponseMedianH: null,
              firstResponseP90H: null,
              resolutionTimeMedianH: null,
              resolutionTimeP90H: null,
              firstResponseBuckets: RESPONSE_TIME_BUCKET_LABELS.map((label) => ({ label, count: null })),
            }
          }
          return {
            category: row.category,
            suppressed: false,
            volume: row.createdCount,
            responseRate: buildRatio(row.responseCount, row.createdCount, 100),
            firstResponseMedianH: computePercentileFromBuckets(
              row.respBuckets,
              RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
              50,
            ),
            firstResponseP90H: computePercentileFromBuckets(
              row.respBuckets,
              RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
              90,
            ),
            resolutionTimeMedianH: computePercentileFromBuckets(
              row.resBuckets,
              RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
              50,
            ),
            resolutionTimeP90H: computePercentileFromBuckets(
              row.resBuckets,
              RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
              90,
            ),
            firstResponseBuckets: RESPONSE_TIME_BUCKET_LABELS.map((label, idx) => ({
              label,
              count: row.respBuckets[idx] ?? 0,
            })),
          }
        }),
        resolvedTotal: suppressedAll ? null : totalResolved,
      }
    })
  }

  async getOutbreaks(user: ActingUser, query: PaginatedAnalyticsQueryDto) {
    const scope = await this.scopeService.resolveOrgScope(user, query, { forceTerritory: true })
    const page = query.page ?? 1
    const limit = query.limit ?? 25

    return this.withCache(
      'outbreaks',
      { scope, category: query.category ?? null, page, limit },
      async () => {
        const result = await this.repository.fetchOutbreaks(
          scope.state,
          scope.cityKey,
          scope.from,
          scope.to,
          query.category,
          page,
          limit,
        )
        const meta = this.buildMeta(scope, result.total, false)
        return {
          ...meta,
          pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.max(1, Math.ceil(result.total / limit)),
          },
          items: result.items.map((item) => ({
            id: item.id,
            city: item.city,
            state: item.state,
            category: item.category,
            reportCount: item.count >= MIN_CELL_SIZE ? item.count : null,
            suppressed: item.count < MIN_CELL_SIZE,
            active: item.active,
            detectedAt: item.detectedAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          })),
        }
      },
    )
  }

  async exportData(user: ActingUser, query: ExportAnalyticsQueryDto) {
    const scope = await this.scopeService.resolveOrgScope(user, query)
    const format = query.format ?? ExportFormat.JSON
    const { mode, areaFilter, directedFilter } = this.buildFiltersForScope(
      scope,
      scope.from,
      scope.to,
      query.category,
    )

    const rows = await this.repository.fetchExportRows(mode, areaFilter, directedFilter)
    const totalVisible = rows.reduce((s, r) => s + r.createdCount, 0)
    const meta = this.buildMeta(scope, totalVisible, rows.length === 0)

    if (format === ExportFormat.CSV) {
      const headerLines = [
        `# Votz Painel de Dados - Exportacao Agregada (${ANALYTICS_DEFINITION_VERSION} / ${ANALYTICS_DEFINITION_DATE})`,
        `# Gerado em: ${meta.computedAt} | Fuso: ${ANALYTICS_TIMEZONE} | Periodo: ${scope.from}..${scope.to}`,
        `# Escopo: ${scope.scopeMode} (${scope.state}${scope.cityKey ? '/' + scope.cityKey : ''}) | K-anonimato minimo: ${MIN_CELL_SIZE} relatos por linha`,
        '# Definicoes: created_count=volume; resolved_count=resolvidos; open_current_count=backlog; contested_count=contestados; response_count=com resposta oficial; support_count=apoios; comment_count=comentarios',
        'day,state,city,category,created_count,resolved_count,open_current_count,contested_count,response_count,support_count,comment_count',
      ]
      const dataLines = rows.map((r) =>
        [
          r.day,
          r.state,
          this.escapeCsvCell(r.cityDisplay),
          r.category,
          r.createdCount,
          r.resolvedCount,
          r.openCurrentCount,
          r.contestedCount,
          r.responseCount,
          r.supportCount,
          r.commentCount,
        ].join(','),
      )
      return {
        format: ExportFormat.CSV,
        filename: `votz-dados-${scope.scopeMode}-${scope.from}-${scope.to}.csv`,
        contentType: 'text/csv; charset=utf-8',
        body: `${headerLines.concat(dataLines).join('\n')}\n`,
      }
    }

    return {
      format: ExportFormat.JSON,
      filename: `votz-dados-${scope.scopeMode}-${scope.from}-${scope.to}.json`,
      contentType: 'application/json; charset=utf-8',
      data: {
        ...meta,
        metricDefinitions: {
          volume: 'Relatos criados no dia/categoria',
          resolutionRate: 'resolvidos / (resolvidos + abertos > 7 dias)',
          responseRate: 'respondidos / volume',
          contestRate: 'contestados / (resolvidos + contestados)',
        },
        rows,
      },
    }
  }

  private escapeCsvCell(value: string): string {
    const clean = (value ?? '').replace(/[\r\n]+/g, ' ').trim()
    const neutralized = /^[=+\-@\t\r]/.test(clean) ? `'${clean}` : clean
    if (neutralized.includes(',') || neutralized.includes('"')) {
      return `"${neutralized.replace(/"/g, '""')}"`
    }
    return neutralized
  }

  async getPeerComparison(user: ActingUser, query: BaseAnalyticsFilterDto): Promise<PeerComparisonResult> {
    await this.scopeService.resolveOrgScope(user, query, { forceTerritory: true })
    return {
      available: false,
      status: 'soon',
      feature: 'peer_comparison',
      reason: 'POPULATION_DATA_UNAVAILABLE',
      message:
        'Em breve: comparativo por porte populacional será liberado após ingestão da base de população do IBGE (mínimo de 5 municípios por faixa, sempre em percentis).',
      populationBrackets: PEER_POPULATION_BRACKETS.map((b) => ({ ...b })),
      minPeersRequired: PEER_MIN_MUNICIPALITIES,
      percentiles: null,
      computedAt: new Date().toISOString(),
      definitionVersion: ANALYTICS_DEFINITION_VERSION,
    }
  }

  private resolvePublicWindowDays(period?: PeriodPreset): number {
    switch (period) {
      case PeriodPreset.D7:
        return 7
      case PeriodPreset.D90:
        return 90
      case PeriodPreset.D365:
        return 365
      default:
        return 30
    }
  }

  private buildPublicSummaryPayload(
    summary: SummaryRollupRow,
    label: { type: 'MUNICIPALITY' | 'ENTITY' | 'POLITICIAN'; name: string; state: string; city?: string | null },
    from: string,
    to: string,
    options?: { hasOwnSla?: boolean },
  ) {
    const suppressed = summary.createdCount < MIN_CELL_SIZE
    const isEntity = label.type === 'ENTITY'
    const hasOwnSla = isEntity ? Boolean(options?.hasOwnSla) : undefined
    const hideEntitySlaRate = isEntity && !hasOwnSla

    return {
      subject: label,
      computedAt: new Date().toISOString(),
      sampleSize: suppressed ? null : summary.createdCount,
      minCellSize: MIN_CELL_SIZE,
      suppressed,
      ...(isEntity ? { hasOwnSla } : {}),
      definitionVersion: ANALYTICS_DEFINITION_VERSION,
      definitionDate: ANALYTICS_DEFINITION_DATE,
      timezone: ANALYTICS_TIMEZONE,
      period: { from, to },
      kpis: suppressed
        ? {
            volume: null,
            resolutionRate: { value: null, numerator: 0, denominator: 0 },
            firstResponseMedianH: null,
            responseRate: { value: null, numerator: 0, denominator: 0 },
            slaComplianceRate: { value: null, numerator: 0, denominator: 0 },
          }
        : {
            volume: summary.createdCount,
            resolutionRate: buildRatio(
              summary.resolvedCount,
              summary.resolvedCount + summary.openOver7dCount,
              100,
            ),
            firstResponseMedianH: computePercentileFromBuckets(
              summary.respBuckets,
              RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
              50,
            ),
            responseRate: buildRatio(summary.responseCount, summary.createdCount, 100),
            slaComplianceRate: hideEntitySlaRate
              ? { value: null, numerator: 0, denominator: 0 }
              : buildRatio(
                  summary.slaMetCount,
                  summary.slaMetCount + summary.slaBreachedCount,
                  100,
                ),
          },
    }
  }

  async getPublicMunicipality(query: PublicMunicipalityAnalyticsDto) {
    const cityKey = normalizeLocationKey(query.city)
    const state = query.state.trim().toUpperCase()
    const days = this.resolvePublicWindowDays(query.period)
    const todayStr = toSaoPauloDateString(new Date())
    const from = addDaysDateString(todayStr, -(days - 1))
    const matureCutoff = addDaysDateString(todayStr, -7)

    return this.withCache('public:municipality', { state, cityKey, from, to: todayStr }, async () => {
      const [summary, cityDisplay] = await Promise.all([
        this.repository.fetchAreaSummary({ state, cityKey, from, to: todayStr }, matureCutoff),
        this.repository.findCityDisplayName(state, cityKey),
      ])
      return this.buildPublicSummaryPayload(
        summary,
        { type: 'MUNICIPALITY', name: cityDisplay || query.city, state, city: cityDisplay || query.city },
        from,
        todayStr,
      )
    })
  }

  async getPublicEntity(id: string, query: PublicOrgAnalyticsDto) {
    const entity = await this.repository.findPublicEntityMeta(id)
    if (!entity) {
      throw new NotFoundException('Entidade não encontrada.')
    }
    const days = this.resolvePublicWindowDays(query.period)
    const todayStr = toSaoPauloDateString(new Date())
    const from = addDaysDateString(todayStr, -(days - 1))
    const matureCutoff = addDaysDateString(todayStr, -7)
    const hasOwnSla = hasConfiguredOwnSla(entity.slaHours)

    return this.withCache('public:entity', { id, from, to: todayStr, hasOwnSla }, async () => {
      const summary = await this.repository.fetchDirectedSummary(
        { recipientType: RecipientType.ENTITY, recipientId: id, from, to: todayStr },
        matureCutoff,
      )
      return this.buildPublicSummaryPayload(
        summary,
        { type: 'ENTITY', name: entity.legalName, state: entity.state ?? '', city: entity.city },
        from,
        todayStr,
        { hasOwnSla },
      )
    })
  }

  async getPublicPolitician(id: string, query: PublicOrgAnalyticsDto) {
    const politician = await this.repository.findPublicPoliticianMeta(id)
    if (!politician) {
      throw new NotFoundException('Político não encontrado.')
    }
    const days = this.resolvePublicWindowDays(query.period)
    const todayStr = toSaoPauloDateString(new Date())
    const from = addDaysDateString(todayStr, -(days - 1))
    const matureCutoff = addDaysDateString(todayStr, -7)

    return this.withCache('public:politician', { id, from, to: todayStr }, async () => {
      const summary = await this.repository.fetchDirectedSummary(
        { recipientType: RecipientType.POLITICIAN, recipientId: id, from, to: todayStr },
        matureCutoff,
      )
      return this.buildPublicSummaryPayload(
        summary,
        {
          type: 'POLITICIAN',
          name: politician.name,
          state: politician.state ?? '',
          city: politician.city,
        },
        from,
        todayStr,
      )
    })
  }
}
