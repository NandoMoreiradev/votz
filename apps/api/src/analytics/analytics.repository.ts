import { Injectable } from '@nestjs/common'
import { Category, Prisma, RecipientType } from '@prisma/client'
import { MIN_CELL_SIZE, normalizeLocationKey } from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'

export interface AreaQueryFilter {
  state: string
  cityKey: string | null
  from: string
  to: string
  category?: Category
  cell7?: string | null
}

export interface DirectedQueryFilter {
  recipientType: RecipientType
  recipientId: string
  from: string
  to: string
  category?: Category
}

export interface SummaryRollupRow {
  createdCount: number
  resolvedCount: number
  openCurrentCount: number
  openOver7dCount: number
  contestedCount: number
  responseCount: number
  resolutionDurationCount: number
  supportCount: number
  commentCount: number
  slaMetCount: number
  slaBreachedCount: number
  pressureSum: number
  respBuckets: number[]
  resBuckets: number[]
  pressureBuckets: number[]
}

export interface CategoryRollupRow {
  category: Category
  createdCount: number
  resolvedCount: number
  openCurrentCount: number
  openOver7dCount: number
  contestedCount: number
  responseCount: number
  resolutionDurationCount: number
  supportCount: number
  commentCount: number
  slaMetCount: number
  slaBreachedCount: number
  pressureSum: number
  respBuckets: number[]
  resBuckets: number[]
}

export interface DailySeriesRow {
  day: string
  createdCount: number
  resolvedCount: number
  openCurrentCount: number
  openOver7dCount: number
  responseCount: number
  supportCount: number
  commentCount: number
  slaMetCount: number
  slaBreachedCount: number
}

export interface OpenByDayRow {
  day: string
  openCurrentCount: number
}

export interface HeatmapCellRow {
  cell7: string
  cityDisplay: string
  createdCount: number
  openCurrentCount: number
  resolvedCount: number
  contestedCount: number
  pressureSum: number
  supportCount: number
}

export interface TopPressureCellRow {
  cell7: string
  category: Category
  cityDisplay: string
  createdCount: number
  avgPressure: number
}

export interface ExportAggregatedRow {
  day: string
  state: string
  cityDisplay: string
  category: Category
  createdCount: number
  resolvedCount: number
  openCurrentCount: number
  contestedCount: number
  responseCount: number
  supportCount: number
  commentCount: number
  slaMetCount: number
  slaBreachedCount: number
}

export interface RecurrenceRow {
  id: string
  state: string
  cityKey: string
  cell7: string
  category: Category
  windowEnd: Date
  count90d: number
  firstSeen: Date
  lastSeen: Date
  avgGapDays: number | null
}

function emptyTimeArray(): number[] {
  return [0, 0, 0, 0, 0, 0, 0, 0]
}

function emptyPressureArray(): number[] {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0]
}

function parseIntArray(raw: unknown, length: number): number[] {
  if (!Array.isArray(raw)) return new Array(length).fill(0)
  return Array.from({ length }, (_, idx) => Number(raw[idx] ?? 0))
}

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildAreaWhereSql(filter: AreaQueryFilter): Prisma.Sql {
    const clauses: Prisma.Sql[] = [
      Prisma.sql`state = ${filter.state}`,
      Prisma.sql`day >= ${filter.from}::date`,
      Prisma.sql`day <= ${filter.to}::date`,
    ]
    if (filter.cityKey) {
      clauses.push(Prisma.sql`city_key = ${filter.cityKey}`)
    }
    if (filter.category) {
      clauses.push(Prisma.sql`category = ${filter.category}::"Category"`)
    }
    if (filter.cell7) {
      clauses.push(Prisma.sql`cell7 = ${filter.cell7}`)
    }
    return Prisma.join(clauses, ' AND ')
  }

  private buildDirectedWhereSql(filter: DirectedQueryFilter): Prisma.Sql {
    const clauses: Prisma.Sql[] = [
      Prisma.sql`recipient_type = ${filter.recipientType}::"RecipientType"`,
      Prisma.sql`recipient_id = ${filter.recipientId}`,
      Prisma.sql`day >= ${filter.from}::date`,
      Prisma.sql`day <= ${filter.to}::date`,
    ]
    if (filter.category) {
      clauses.push(Prisma.sql`category = ${filter.category}::"Category"`)
    }
    return Prisma.join(clauses, ' AND ')
  }

  async fetchAreaSummary(filter: AreaQueryFilter, matureCutoffDay: string): Promise<SummaryRollupRow> {
    const whereSql = this.buildAreaWhereSql(filter)
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        COALESCE(SUM(created_count), 0)::int AS created_count,
        COALESCE(SUM(resolved_count), 0)::int AS resolved_count,
        COALESCE(SUM(open_current_count), 0)::int AS open_current_count,
        COALESCE(SUM(open_current_count) FILTER (WHERE day <= ${matureCutoffDay}::date), 0)::int AS open_over_7d_count,
        COALESCE(SUM(contested_count), 0)::int AS contested_count,
        COALESCE(SUM(response_count), 0)::int AS response_count,
        COALESCE(SUM(resolution_duration_count), 0)::int AS resolution_duration_count,
        COALESCE(SUM(support_count), 0)::int AS support_count,
        COALESCE(SUM(comment_count), 0)::int AS comment_count,
        COALESCE(SUM(sla_met_count), 0)::int AS sla_met_count,
        COALESCE(SUM(sla_breached_count), 0)::int AS sla_breached_count,
        COALESCE(SUM(pressure_sum), 0)::float8 AS pressure_sum,
        ARRAY[
          COALESCE(SUM(resp_buckets[1]), 0),
          COALESCE(SUM(resp_buckets[2]), 0),
          COALESCE(SUM(resp_buckets[3]), 0),
          COALESCE(SUM(resp_buckets[4]), 0),
          COALESCE(SUM(resp_buckets[5]), 0),
          COALESCE(SUM(resp_buckets[6]), 0),
          COALESCE(SUM(resp_buckets[7]), 0),
          COALESCE(SUM(resp_buckets[8]), 0)
        ]::int[] AS resp_buckets,
        ARRAY[
          COALESCE(SUM(res_buckets[1]), 0),
          COALESCE(SUM(res_buckets[2]), 0),
          COALESCE(SUM(res_buckets[3]), 0),
          COALESCE(SUM(res_buckets[4]), 0),
          COALESCE(SUM(res_buckets[5]), 0),
          COALESCE(SUM(res_buckets[6]), 0),
          COALESCE(SUM(res_buckets[7]), 0),
          COALESCE(SUM(res_buckets[8]), 0)
        ]::int[] AS res_buckets,
        ARRAY[
          COALESCE(SUM(pressure_buckets[1]), 0),
          COALESCE(SUM(pressure_buckets[2]), 0),
          COALESCE(SUM(pressure_buckets[3]), 0),
          COALESCE(SUM(pressure_buckets[4]), 0),
          COALESCE(SUM(pressure_buckets[5]), 0),
          COALESCE(SUM(pressure_buckets[6]), 0),
          COALESCE(SUM(pressure_buckets[7]), 0),
          COALESCE(SUM(pressure_buckets[8]), 0),
          COALESCE(SUM(pressure_buckets[9]), 0)
        ]::int[] AS pressure_buckets
      FROM area_metrics_daily
      WHERE ${whereSql}
    `)
    return this.mapSummaryRow(rows[0])
  }

  async fetchDirectedSummary(
    filter: DirectedQueryFilter,
    matureCutoffDay: string,
  ): Promise<SummaryRollupRow> {
    const whereSql = this.buildDirectedWhereSql(filter)
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        COALESCE(SUM(created_count), 0)::int AS created_count,
        COALESCE(SUM(resolved_count), 0)::int AS resolved_count,
        COALESCE(SUM(open_current_count), 0)::int AS open_current_count,
        COALESCE(SUM(open_current_count) FILTER (WHERE day <= ${matureCutoffDay}::date), 0)::int AS open_over_7d_count,
        COALESCE(SUM(contested_count), 0)::int AS contested_count,
        COALESCE(SUM(response_count), 0)::int AS response_count,
        COALESCE(SUM(resolution_duration_count), 0)::int AS resolution_duration_count,
        COALESCE(SUM(support_count), 0)::int AS support_count,
        COALESCE(SUM(comment_count), 0)::int AS comment_count,
        COALESCE(SUM(sla_met_count), 0)::int AS sla_met_count,
        COALESCE(SUM(sla_breached_count), 0)::int AS sla_breached_count,
        COALESCE(SUM(pressure_sum), 0)::float8 AS pressure_sum,
        ARRAY[
          COALESCE(SUM(resp_buckets[1]), 0),
          COALESCE(SUM(resp_buckets[2]), 0),
          COALESCE(SUM(resp_buckets[3]), 0),
          COALESCE(SUM(resp_buckets[4]), 0),
          COALESCE(SUM(resp_buckets[5]), 0),
          COALESCE(SUM(resp_buckets[6]), 0),
          COALESCE(SUM(resp_buckets[7]), 0),
          COALESCE(SUM(resp_buckets[8]), 0)
        ]::int[] AS resp_buckets,
        ARRAY[
          COALESCE(SUM(res_buckets[1]), 0),
          COALESCE(SUM(res_buckets[2]), 0),
          COALESCE(SUM(res_buckets[3]), 0),
          COALESCE(SUM(res_buckets[4]), 0),
          COALESCE(SUM(res_buckets[5]), 0),
          COALESCE(SUM(res_buckets[6]), 0),
          COALESCE(SUM(res_buckets[7]), 0),
          COALESCE(SUM(res_buckets[8]), 0)
        ]::int[] AS res_buckets,
        ARRAY[
          COALESCE(SUM(pressure_buckets[1]), 0),
          COALESCE(SUM(pressure_buckets[2]), 0),
          COALESCE(SUM(pressure_buckets[3]), 0),
          COALESCE(SUM(pressure_buckets[4]), 0),
          COALESCE(SUM(pressure_buckets[5]), 0),
          COALESCE(SUM(pressure_buckets[6]), 0),
          COALESCE(SUM(pressure_buckets[7]), 0),
          COALESCE(SUM(pressure_buckets[8]), 0),
          COALESCE(SUM(pressure_buckets[9]), 0)
        ]::int[] AS pressure_buckets
      FROM recipient_metrics_daily
      WHERE ${whereSql}
    `)
    return this.mapSummaryRow(rows[0])
  }

  private mapSummaryRow(row?: Record<string, unknown>): SummaryRollupRow {
    if (!row) {
      return {
        createdCount: 0,
        resolvedCount: 0,
        openCurrentCount: 0,
        openOver7dCount: 0,
        contestedCount: 0,
        responseCount: 0,
        resolutionDurationCount: 0,
        supportCount: 0,
        commentCount: 0,
        slaMetCount: 0,
        slaBreachedCount: 0,
        pressureSum: 0,
        respBuckets: emptyTimeArray(),
        resBuckets: emptyTimeArray(),
        pressureBuckets: emptyPressureArray(),
      }
    }
    return {
      createdCount: Number(row.created_count ?? 0),
      resolvedCount: Number(row.resolved_count ?? 0),
      openCurrentCount: Number(row.open_current_count ?? 0),
      openOver7dCount: Number(row.open_over_7d_count ?? 0),
      contestedCount: Number(row.contested_count ?? 0),
      responseCount: Number(row.response_count ?? 0),
      resolutionDurationCount: Number(row.resolution_duration_count ?? 0),
      supportCount: Number(row.support_count ?? 0),
      commentCount: Number(row.comment_count ?? 0),
      slaMetCount: Number(row.sla_met_count ?? 0),
      slaBreachedCount: Number(row.sla_breached_count ?? 0),
      pressureSum: Number(row.pressure_sum ?? 0),
      respBuckets: parseIntArray(row.resp_buckets, 8),
      resBuckets: parseIntArray(row.res_buckets, 8),
      pressureBuckets: parseIntArray(row.pressure_buckets, 9),
    }
  }

  async fetchOpenByDay(
    mode: 'area' | 'directed',
    areaFilter: AreaQueryFilter | null,
    directedFilter: DirectedQueryFilter | null,
  ): Promise<OpenByDayRow[]> {
    const rows =
      mode === 'area' && areaFilter
        ? await this.prisma.$queryRaw<Array<{ day: string; open_current_count: number }>>(Prisma.sql`
            SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day, SUM(open_current_count)::int AS open_current_count
            FROM area_metrics_daily
            WHERE ${this.buildAreaWhereSql(areaFilter)} AND open_current_count > 0
            GROUP BY day
            ORDER BY day ASC
          `)
        : directedFilter
          ? await this.prisma.$queryRaw<Array<{ day: string; open_current_count: number }>>(Prisma.sql`
              SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day, SUM(open_current_count)::int AS open_current_count
              FROM recipient_metrics_daily
              WHERE ${this.buildDirectedWhereSql(directedFilter)} AND open_current_count > 0
              GROUP BY day
              ORDER BY day ASC
            `)
          : []

    return rows.map((r) => ({
      day: r.day,
      openCurrentCount: Number(r.open_current_count ?? 0),
    }))
  }

  async fetchCategoryBreakdown(
    mode: 'area' | 'directed',
    areaFilter: AreaQueryFilter | null,
    directedFilter: DirectedQueryFilter | null,
    matureCutoffDay: string,
  ): Promise<CategoryRollupRow[]> {
    const rows =
      mode === 'area' && areaFilter
        ? await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
            SELECT
              category,
              SUM(created_count)::int AS created_count,
              SUM(resolved_count)::int AS resolved_count,
              SUM(open_current_count)::int AS open_current_count,
              SUM(open_current_count) FILTER (WHERE day <= ${matureCutoffDay}::date)::int AS open_over_7d_count,
              SUM(contested_count)::int AS contested_count,
              SUM(response_count)::int AS response_count,
              SUM(resolution_duration_count)::int AS resolution_duration_count,
              SUM(support_count)::int AS support_count,
              SUM(comment_count)::int AS comment_count,
              SUM(sla_met_count)::int AS sla_met_count,
              SUM(sla_breached_count)::int AS sla_breached_count,
              SUM(pressure_sum)::float8 AS pressure_sum,
              ARRAY[
                COALESCE(SUM(resp_buckets[1]), 0),
                COALESCE(SUM(resp_buckets[2]), 0),
                COALESCE(SUM(resp_buckets[3]), 0),
                COALESCE(SUM(resp_buckets[4]), 0),
                COALESCE(SUM(resp_buckets[5]), 0),
                COALESCE(SUM(resp_buckets[6]), 0),
                COALESCE(SUM(resp_buckets[7]), 0),
                COALESCE(SUM(resp_buckets[8]), 0)
              ]::int[] AS resp_buckets,
              ARRAY[
                COALESCE(SUM(res_buckets[1]), 0),
                COALESCE(SUM(res_buckets[2]), 0),
                COALESCE(SUM(res_buckets[3]), 0),
                COALESCE(SUM(res_buckets[4]), 0),
                COALESCE(SUM(res_buckets[5]), 0),
                COALESCE(SUM(res_buckets[6]), 0),
                COALESCE(SUM(res_buckets[7]), 0),
                COALESCE(SUM(res_buckets[8]), 0)
              ]::int[] AS res_buckets
            FROM area_metrics_daily
            WHERE ${this.buildAreaWhereSql(areaFilter)}
            GROUP BY category
            ORDER BY created_count DESC
          `)
        : directedFilter
          ? await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
              SELECT
                category,
                SUM(created_count)::int AS created_count,
                SUM(resolved_count)::int AS resolved_count,
                SUM(open_current_count)::int AS open_current_count,
                SUM(open_current_count) FILTER (WHERE day <= ${matureCutoffDay}::date)::int AS open_over_7d_count,
                SUM(contested_count)::int AS contested_count,
                SUM(response_count)::int AS response_count,
                SUM(resolution_duration_count)::int AS resolution_duration_count,
                SUM(support_count)::int AS support_count,
                SUM(comment_count)::int AS comment_count,
                SUM(sla_met_count)::int AS sla_met_count,
                SUM(sla_breached_count)::int AS sla_breached_count,
                SUM(pressure_sum)::float8 AS pressure_sum,
                ARRAY[
                  COALESCE(SUM(resp_buckets[1]), 0),
                  COALESCE(SUM(resp_buckets[2]), 0),
                  COALESCE(SUM(resp_buckets[3]), 0),
                  COALESCE(SUM(resp_buckets[4]), 0),
                  COALESCE(SUM(resp_buckets[5]), 0),
                  COALESCE(SUM(resp_buckets[6]), 0),
                  COALESCE(SUM(resp_buckets[7]), 0),
                  COALESCE(SUM(resp_buckets[8]), 0)
                ]::int[] AS resp_buckets,
                ARRAY[
                  COALESCE(SUM(res_buckets[1]), 0),
                  COALESCE(SUM(res_buckets[2]), 0),
                  COALESCE(SUM(res_buckets[3]), 0),
                  COALESCE(SUM(res_buckets[4]), 0),
                  COALESCE(SUM(res_buckets[5]), 0),
                  COALESCE(SUM(res_buckets[6]), 0),
                  COALESCE(SUM(res_buckets[7]), 0),
                  COALESCE(SUM(res_buckets[8]), 0)
                ]::int[] AS res_buckets
              FROM recipient_metrics_daily
              WHERE ${this.buildDirectedWhereSql(directedFilter)}
              GROUP BY category
              ORDER BY created_count DESC
            `)
          : []

    return rows.map((row) => ({
      category: row.category as Category,
      createdCount: Number(row.created_count ?? 0),
      resolvedCount: Number(row.resolved_count ?? 0),
      openCurrentCount: Number(row.open_current_count ?? 0),
      openOver7dCount: Number(row.open_over_7d_count ?? 0),
      contestedCount: Number(row.contested_count ?? 0),
      responseCount: Number(row.response_count ?? 0),
      resolutionDurationCount: Number(row.resolution_duration_count ?? 0),
      supportCount: Number(row.support_count ?? 0),
      commentCount: Number(row.comment_count ?? 0),
      slaMetCount: Number(row.sla_met_count ?? 0),
      slaBreachedCount: Number(row.sla_breached_count ?? 0),
      pressureSum: Number(row.pressure_sum ?? 0),
      respBuckets: parseIntArray(row.resp_buckets, 8),
      resBuckets: parseIntArray(row.res_buckets, 8),
    }))
  }

  async fetchDailySeries(
    mode: 'area' | 'directed',
    areaFilter: AreaQueryFilter | null,
    directedFilter: DirectedQueryFilter | null,
    matureCutoffDay: string,
  ): Promise<DailySeriesRow[]> {
    const rows =
      mode === 'area' && areaFilter
        ? await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
            SELECT
              TO_CHAR(day, 'YYYY-MM-DD') AS day,
              SUM(created_count)::int AS created_count,
              SUM(resolved_count)::int AS resolved_count,
              SUM(open_current_count)::int AS open_current_count,
              SUM(open_current_count) FILTER (WHERE day <= ${matureCutoffDay}::date)::int AS open_over_7d_count,
              SUM(response_count)::int AS response_count,
              SUM(support_count)::int AS support_count,
              SUM(comment_count)::int AS comment_count,
              SUM(sla_met_count)::int AS sla_met_count,
              SUM(sla_breached_count)::int AS sla_breached_count
            FROM area_metrics_daily
            WHERE ${this.buildAreaWhereSql(areaFilter)}
            GROUP BY day
            ORDER BY day ASC
          `)
        : directedFilter
          ? await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
              SELECT
                TO_CHAR(day, 'YYYY-MM-DD') AS day,
                SUM(created_count)::int AS created_count,
                SUM(resolved_count)::int AS resolved_count,
                SUM(open_current_count)::int AS open_current_count,
                SUM(open_current_count) FILTER (WHERE day <= ${matureCutoffDay}::date)::int AS open_over_7d_count,
                SUM(response_count)::int AS response_count,
                SUM(support_count)::int AS support_count,
                SUM(comment_count)::int AS comment_count,
                SUM(sla_met_count)::int AS sla_met_count,
                SUM(sla_breached_count)::int AS sla_breached_count
              FROM recipient_metrics_daily
              WHERE ${this.buildDirectedWhereSql(directedFilter)}
              GROUP BY day
              ORDER BY day ASC
            `)
          : []

    return rows.map((r) => ({
      day: String(r.day),
      createdCount: Number(r.created_count ?? 0),
      resolvedCount: Number(r.resolved_count ?? 0),
      openCurrentCount: Number(r.open_current_count ?? 0),
      openOver7dCount: Number(r.open_over_7d_count ?? 0),
      responseCount: Number(r.response_count ?? 0),
      supportCount: Number(r.support_count ?? 0),
      commentCount: Number(r.comment_count ?? 0),
      slaMetCount: Number(r.sla_met_count ?? 0),
      slaBreachedCount: Number(r.sla_breached_count ?? 0),
    }))
  }

  async fetchHeatmapCells(
    filter: AreaQueryFilter,
  ): Promise<{ visibleCells: HeatmapCellRow[]; suppressedCellsCount: number; suppressedVolume: number }> {
    const whereSql = this.buildAreaWhereSql(filter)
    const visible = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        cell7,
        MAX(city_display) AS city_display,
        SUM(created_count)::int AS created_count,
        SUM(open_current_count)::int AS open_current_count,
        SUM(resolved_count)::int AS resolved_count,
        SUM(contested_count)::int AS contested_count,
        SUM(pressure_sum)::float8 AS pressure_sum,
        SUM(support_count)::int AS support_count
      FROM area_metrics_daily
      WHERE ${whereSql} AND cell7 IS NOT NULL AND cell7 <> ''
      GROUP BY cell7
      HAVING SUM(created_count) >= ${MIN_CELL_SIZE}
      ORDER BY created_count DESC
      LIMIT 500
    `)

    const suppressedRows = await this.prisma.$queryRaw<
      Array<{ suppressed_cells: number; suppressed_volume: number }>
    >(Prisma.sql`
      SELECT
        COUNT(*)::int AS suppressed_cells,
        COALESCE(SUM(cell_created), 0)::int AS suppressed_volume
      FROM (
        SELECT cell7, SUM(created_count)::int AS cell_created
        FROM area_metrics_daily
        WHERE ${whereSql} AND cell7 IS NOT NULL AND cell7 <> ''
        GROUP BY cell7
        HAVING SUM(created_count) < ${MIN_CELL_SIZE}
      ) sub
    `)

    return {
      visibleCells: visible.map((r) => ({
        cell7: String(r.cell7),
        cityDisplay: String(r.city_display ?? ''),
        createdCount: Number(r.created_count ?? 0),
        openCurrentCount: Number(r.open_current_count ?? 0),
        resolvedCount: Number(r.resolved_count ?? 0),
        contestedCount: Number(r.contested_count ?? 0),
        pressureSum: Number(r.pressure_sum ?? 0),
        supportCount: Number(r.support_count ?? 0),
      })),
      suppressedCellsCount: Number(suppressedRows[0]?.suppressed_cells ?? 0),
      suppressedVolume: Number(suppressedRows[0]?.suppressed_volume ?? 0),
    }
  }

  async fetchTopPressureCells(filter: AreaQueryFilter, limit = 5): Promise<TopPressureCellRow[]> {
    const whereSql = this.buildAreaWhereSql(filter)
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        cell7,
        category,
        MAX(city_display) AS city_display,
        SUM(created_count)::int AS created_count,
        (SUM(pressure_sum) / NULLIF(SUM(created_count), 0))::float8 AS avg_pressure
      FROM area_metrics_daily
      WHERE ${whereSql} AND cell7 IS NOT NULL AND cell7 <> ''
      GROUP BY cell7, category
      HAVING SUM(created_count) >= ${MIN_CELL_SIZE}
      ORDER BY avg_pressure DESC, created_count DESC
      LIMIT ${limit}
    `)

    return rows.map((r) => ({
      cell7: String(r.cell7),
      category: r.category as Category,
      cityDisplay: String(r.city_display ?? ''),
      createdCount: Number(r.created_count ?? 0),
      avgPressure: Number(Number(r.avg_pressure ?? 0).toFixed(2)),
    }))
  }

  async fetchLatestRecurrenceWindow(
    state: string,
    cityKey: string | null,
    category?: Category,
  ): Promise<{
    windowEnd: Date | null
    visibleTotal: number
    allRecurrentCellsCount: number
    allRecurrentVolume: number
    suppressedCellsCount: number
    visibleRows: RecurrenceRow[]
    total90dVolume: number
  }> {
    const latest = await this.prisma.recurrenceCell.findFirst({
      where: {
        state,
        ...(cityKey ? { cityKey } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: { windowEnd: 'desc' },
      select: { windowEnd: true },
    })

    if (!latest) {
      return {
        windowEnd: null,
        visibleTotal: 0,
        allRecurrentCellsCount: 0,
        allRecurrentVolume: 0,
        suppressedCellsCount: 0,
        visibleRows: [],
        total90dVolume: 0,
      }
    }

    const baseWhere: Prisma.RecurrenceCellWhereInput = {
      state,
      ...(cityKey ? { cityKey } : {}),
      ...(category ? { category } : {}),
      windowEnd: latest.windowEnd,
    }

    const [allAgg, suppressedCount, visibleRows] = await Promise.all([
      this.prisma.recurrenceCell.aggregate({
        where: baseWhere,
        _count: { _all: true },
        _sum: { count90d: true },
      }),
      this.prisma.recurrenceCell.count({
        where: { ...baseWhere, count90d: { lt: MIN_CELL_SIZE } },
      }),
      this.prisma.recurrenceCell.findMany({
        where: { ...baseWhere, count90d: { gte: MIN_CELL_SIZE } },
        orderBy: [{ count90d: 'desc' }, { lastSeen: 'desc' }],
        take: 250,
      }),
    ])

    const windowEndStr = latest.windowEnd.toISOString().slice(0, 10)
    const windowStartDate = new Date(latest.windowEnd.getTime() - 89 * 86_400_000)
    const windowStartStr = windowStartDate.toISOString().slice(0, 10)

    const areaVol = await this.prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(created_count), 0)::int AS total
      FROM area_metrics_daily
      WHERE state = ${state}
        ${cityKey ? Prisma.sql`AND city_key = ${cityKey}` : Prisma.empty}
        ${category ? Prisma.sql`AND category = ${category}::"Category"` : Prisma.empty}
        AND day >= ${windowStartStr}::date
        AND day <= ${windowEndStr}::date
    `)

    return {
      windowEnd: latest.windowEnd,
      visibleTotal: visibleRows.length,
      allRecurrentCellsCount: allAgg._count._all,
      allRecurrentVolume: Number(allAgg._sum.count90d ?? 0),
      suppressedCellsCount: suppressedCount,
      visibleRows,
      total90dVolume: Number(areaVol[0]?.total ?? 0),
    }
  }

  async fetchOutbreaks(
    state: string,
    cityKey: string | null,
    from: string,
    to: string,
    category: Category | undefined,
    page: number,
    limit: number,
  ) {
    const startDate = new Date(`${from}T00:00:00.000Z`)
    const endDate = new Date(`${to}T23:59:59.999Z`)
    const allRows = await this.prisma.surto.findMany({
      where: {
        state,
        ...(category ? { category } : {}),
        detectedAt: { gte: startDate, lte: endDate },
      },
      orderBy: { detectedAt: 'desc' },
      take: 500,
      select: {
        id: true,
        city: true,
        state: true,
        category: true,
        count: true,
        active: true,
        detectedAt: true,
        updatedAt: true,
      },
    })

    const filtered = cityKey
      ? allRows.filter((row) => normalizeLocationKey(row.city) === cityKey)
      : allRows

    const total = filtered.length
    const skip = (page - 1) * limit
    return {
      total,
      items: filtered.slice(skip, skip + limit),
    }
  }

  async fetchExportRows(
    mode: 'area' | 'directed',
    areaFilter: AreaQueryFilter | null,
    directedFilter: DirectedQueryFilter | null,
  ): Promise<ExportAggregatedRow[]> {
    // Exportação sempre agrega por (day, state, cityDisplay, category) e suprime grupos < MIN_CELL_SIZE
    const rows =
      mode === 'area' && areaFilter
        ? await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
            SELECT
              TO_CHAR(day, 'YYYY-MM-DD') AS day,
              state,
              MAX(city_display) AS city_display,
              category,
              SUM(created_count)::int AS created_count,
              SUM(resolved_count)::int AS resolved_count,
              SUM(open_current_count)::int AS open_current_count,
              SUM(contested_count)::int AS contested_count,
              SUM(response_count)::int AS response_count,
              SUM(support_count)::int AS support_count,
              SUM(comment_count)::int AS comment_count,
              SUM(sla_met_count)::int AS sla_met_count,
              SUM(sla_breached_count)::int AS sla_breached_count
            FROM area_metrics_daily
            WHERE ${this.buildAreaWhereSql(areaFilter)}
            GROUP BY day, state, city_key, category
            HAVING SUM(created_count) >= ${MIN_CELL_SIZE}
            ORDER BY day ASC, category ASC
            LIMIT 10000
          `)
        : directedFilter
          ? await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
              SELECT
                TO_CHAR(day, 'YYYY-MM-DD') AS day,
                '' AS state,
                '' AS city_display,
                category,
                SUM(created_count)::int AS created_count,
                SUM(resolved_count)::int AS resolved_count,
                SUM(open_current_count)::int AS open_current_count,
                SUM(contested_count)::int AS contested_count,
                SUM(response_count)::int AS response_count,
                SUM(support_count)::int AS support_count,
                SUM(comment_count)::int AS comment_count,
                SUM(sla_met_count)::int AS sla_met_count,
                SUM(sla_breached_count)::int AS sla_breached_count
              FROM recipient_metrics_daily
              WHERE ${this.buildDirectedWhereSql(directedFilter)}
              GROUP BY day, category
              HAVING SUM(created_count) >= ${MIN_CELL_SIZE}
              ORDER BY day ASC, category ASC
              LIMIT 10000
            `)
          : []

    return rows.map((r) => ({
      day: String(r.day),
      state: String(r.state ?? ''),
      cityDisplay: String(r.city_display ?? ''),
      category: r.category as Category,
      createdCount: Number(r.created_count ?? 0),
      resolvedCount: Number(r.resolved_count ?? 0),
      openCurrentCount: Number(r.open_current_count ?? 0),
      contestedCount: Number(r.contested_count ?? 0),
      responseCount: Number(r.response_count ?? 0),
      supportCount: Number(r.support_count ?? 0),
      commentCount: Number(r.comment_count ?? 0),
      slaMetCount: Number(r.sla_met_count ?? 0),
      slaBreachedCount: Number(r.sla_breached_count ?? 0),
    }))
  }

  async findPublicEntityMeta(id: string) {
    return this.prisma.entity.findUnique({
      where: { id },
      select: { id: true, legalName: true, state: true, city: true },
    })
  }

  async findPublicPoliticianMeta(id: string) {
    return this.prisma.politician.findUnique({
      where: { id },
      select: { id: true, name: true, office: true, state: true, city: true },
    })
  }

  async findCityDisplayName(state: string, cityKey: string): Promise<string | null> {
    const row = await this.prisma.areaMetricDaily.findFirst({
      where: { state, cityKey, cityDisplay: { not: '' } },
      select: { cityDisplay: true },
    })
    return row?.cityDisplay ?? null
  }
}
