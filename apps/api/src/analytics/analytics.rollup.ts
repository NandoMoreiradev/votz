import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { Category, Prisma, RecipientType } from '@prisma/client'
import type Redis from 'ioredis'
import {
  PRESSURE_BUCKET_BOUNDS,
  RECURRENCE_MIN_REPORTS,
  RECURRENCE_WINDOW_DAYS,
  RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
  encodeGeohash7,
  normalizeLocationKey,
} from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import {
  ANALYTICS_CACHE_EPOCH_KEY,
  addDaysDateString,
  bucketIndex,
  diffDaysBetweenStrings,
  emptyPressureBuckets,
  emptyTimeBuckets,
  toSaoPauloDateString,
} from './analytics.constants'

export const ANALYTICS_REDIS_CLIENT = 'ANALYTICS_REDIS_CLIENT'

export interface RawReportForRollup {
  id: string
  category: Category
  status: string
  state: string | null
  city: string | null
  cityKey: string | null
  latitude: number | null
  longitude: number | null
  cell7: string | null
  recipientType: RecipientType | null
  recipientId: string | null
  pressureScore: number
  createdAt: Date
  firstResponseAt: Date | null
  resolvedAt: Date | null
  supportCount: number
  commentCount: number
  hasDispute: boolean
  slaState?: string | null
}

export interface AggregatedAreaBucket {
  day: string
  state: string
  cityKey: string
  cityDisplay: string
  cell7: string | null
  category: Category
  createdCount: number
  resolvedCount: number
  openCurrentCount: number
  contestedCount: number
  responseCount: number
  resolutionDurationCount: number
  respBuckets: number[]
  resBuckets: number[]
  pressureBuckets: number[]
  pressureSum: number
  supportCount: number
  commentCount: number
  slaMetCount: number
  slaBreachedCount: number
}

export interface AggregatedRecipientBucket {
  day: string
  recipientType: RecipientType
  recipientId: string
  category: Category
  createdCount: number
  resolvedCount: number
  openCurrentCount: number
  contestedCount: number
  responseCount: number
  resolutionDurationCount: number
  respBuckets: number[]
  resBuckets: number[]
  pressureBuckets: number[]
  pressureSum: number
  supportCount: number
  commentCount: number
  slaMetCount: number
  slaBreachedCount: number
}

export interface ReconciliationResult {
  daysChecked: number
  mismatches: Array<{
    day: string
    field: string
    rawValue: number
    rollupValue: number
  }>
  passed: boolean
}

const OPEN_STATUSES = new Set(['OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'DISPUTED'])

export function aggregateReportsForRollup(reports: readonly RawReportForRollup[]): {
  areaRows: AggregatedAreaBucket[]
  recipientRows: AggregatedRecipientBucket[]
} {
  const areaMap = new Map<string, AggregatedAreaBucket>()
  const recipientMap = new Map<string, AggregatedRecipientBucket>()

  for (const r of reports) {
    const day = toSaoPauloDateString(r.createdAt)
    const state = (r.state ?? '').trim().toUpperCase()
    const cityKey = r.cityKey ?? normalizeLocationKey(r.city)
    const cityDisplay = (r.city ?? '').trim()
    const cell7 = r.cell7 ?? encodeGeohash7(r.latitude, r.longitude)
    const category = r.category

    const areaKey = `${day}|${state}|${cityKey}|${cell7 ?? ''}|${category}`
    let area = areaMap.get(areaKey)
    if (!area) {
      area = {
        day,
        state,
        cityKey,
        cityDisplay,
        cell7,
        category,
        createdCount: 0,
        resolvedCount: 0,
        openCurrentCount: 0,
        contestedCount: 0,
        responseCount: 0,
        resolutionDurationCount: 0,
        respBuckets: emptyTimeBuckets(),
        resBuckets: emptyTimeBuckets(),
        pressureBuckets: emptyPressureBuckets(),
        pressureSum: 0,
        supportCount: 0,
        commentCount: 0,
        slaMetCount: 0,
        slaBreachedCount: 0,
      }
      areaMap.set(areaKey, area)
    } else if (!area.cityDisplay && cityDisplay) {
      area.cityDisplay = cityDisplay
    }

    accumulateBucket(area, r)

    if (r.recipientType && r.recipientId) {
      const recKey = `${day}|${r.recipientType}|${r.recipientId}|${category}`
      let rec = recipientMap.get(recKey)
      if (!rec) {
        rec = {
          day,
          recipientType: r.recipientType,
          recipientId: r.recipientId,
          category,
          createdCount: 0,
          resolvedCount: 0,
          openCurrentCount: 0,
          contestedCount: 0,
          responseCount: 0,
          resolutionDurationCount: 0,
          respBuckets: emptyTimeBuckets(),
          resBuckets: emptyTimeBuckets(),
          pressureBuckets: emptyPressureBuckets(),
          pressureSum: 0,
          supportCount: 0,
          commentCount: 0,
          slaMetCount: 0,
          slaBreachedCount: 0,
        }
        recipientMap.set(recKey, rec)
      }
      accumulateBucket(rec, r)
    }
  }

  return {
    areaRows: Array.from(areaMap.values()),
    recipientRows: Array.from(recipientMap.values()),
  }
}

function accumulateBucket(
  target: {
    createdCount: number
    resolvedCount: number
    openCurrentCount: number
    contestedCount: number
    responseCount: number
    resolutionDurationCount: number
    respBuckets: number[]
    resBuckets: number[]
    pressureBuckets: number[]
    pressureSum: number
    supportCount: number
    commentCount: number
    slaMetCount: number
    slaBreachedCount: number
  },
  r: RawReportForRollup,
) {
  target.createdCount += 1
  if (r.status === 'RESOLVED') target.resolvedCount += 1
  if (OPEN_STATUSES.has(r.status)) target.openCurrentCount += 1
  if (r.status === 'DISPUTED' || r.hasDispute) target.contestedCount += 1
  if (r.recipientType === RecipientType.ENTITY) {
    if (r.slaState === 'MET') target.slaMetCount += 1
    if (r.slaState === 'BREACHED' || r.slaState === 'MET_LATE') target.slaBreachedCount += 1
  }

  if (r.firstResponseAt) {
    const hours = Math.max(0, (r.firstResponseAt.getTime() - r.createdAt.getTime()) / 3_600_000)
    target.responseCount += 1
    target.respBuckets[bucketIndex(hours, RESPONSE_TIME_BUCKET_BOUNDS_HOURS)] += 1
  }

  if (r.resolvedAt) {
    const hours = Math.max(0, (r.resolvedAt.getTime() - r.createdAt.getTime()) / 3_600_000)
    target.resolutionDurationCount += 1
    target.resBuckets[bucketIndex(hours, RESPONSE_TIME_BUCKET_BOUNDS_HOURS)] += 1
  }

  const pressure = Math.max(0, Number(r.pressureScore ?? 0))
  target.pressureBuckets[bucketIndex(pressure, PRESSURE_BUCKET_BOUNDS)] += 1
  target.pressureSum += pressure
  target.supportCount += Number(r.supportCount ?? 0)
  target.commentCount += Number(r.commentCount ?? 0)
}

@Injectable()
export class AnalyticsRollupService {
  private readonly logger = new Logger(AnalyticsRollupService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(ANALYTICS_REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async invalidateCache(): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.incr(ANALYTICS_CACHE_EPOCH_KEY)
    } catch (err) {
      this.logger.warn(`Falha ao invalidar cache analytics: ${(err as Error).message}`)
    }
  }

  async rebuildDays(dayStrings: string[]): Promise<{ days: number; areaRows: number; recipientRows: number }> {
    const uniqueDays = Array.from(new Set(dayStrings.filter(Boolean))).sort()
    if (uniqueDays.length === 0) {
      return { days: 0, areaRows: 0, recipientRows: 0 }
    }

    const { areaRows, recipientRows } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM "area_metrics_daily" WHERE "day" = ANY(${uniqueDays}::date[])`,
        )
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM "recipient_metrics_daily" WHERE "day" = ANY(${uniqueDays}::date[])`,
        )

        const insertedArea = await tx.$executeRaw(
          Prisma.sql`
            WITH filtered_reports AS (
              SELECT
                r.id,
                (r."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS day,
                UPPER(TRIM(COALESCE(r.state, ''))) AS state,
                COALESCE(NULLIF(r.city_key, ''), LOWER(TRIM(COALESCE(r.city, '')))) AS city_key,
                TRIM(COALESCE(r.city, '')) AS city_display,
                r.cell7,
                r.category,
                r.status::text AS status,
                r."recipientType",
                r."recipientId",
                GREATEST(0, COALESCE(r."pressureScore", 0))::float8 AS pressure,
                CASE
                  WHEN r.first_response_at IS NOT NULL
                    THEN GREATEST(0, EXTRACT(EPOCH FROM (r.first_response_at - r."createdAt")) / 3600.0)
                  ELSE NULL
                END AS resp_h,
                CASE
                  WHEN r.resolved_at IS NOT NULL
                    THEN GREATEST(0, EXTRACT(EPOCH FROM (r.resolved_at - r."createdAt")) / 3600.0)
                  ELSE NULL
                END AS res_h,
                EXISTS (
                  SELECT 1 FROM "timeline_events" te
                  WHERE te."reportId" = r.id AND te.type = 'DISPUTED'
                ) AS has_dispute,
                (SELECT COUNT(*)::int FROM "votes" v WHERE v."reportId" = r.id) AS support_cnt,
                (SELECT COUNT(*)::int FROM "comments" c WHERE c."reportId" = r.id) AS comment_cnt,
                r.sla_state::text AS sla_state
              FROM "reports" r
              WHERE (r."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ANY(${uniqueDays}::date[])
            )
            INSERT INTO "area_metrics_daily" (
              "id", "day", "state", "city_key", "city_display", "cell7", "category",
              "created_count", "resolved_count", "open_current_count", "contested_count",
              "response_count", "resolution_duration_count",
              "resp_buckets", "res_buckets", "pressure_buckets",
              "pressure_sum", "support_count", "comment_count",
              "sla_met_count", "sla_breached_count", "updated_at"
            )
            SELECT
              gen_random_uuid()::text,
              day,
              state,
              city_key,
              MAX(city_display),
              cell7,
              category,
              COUNT(*)::int,
              COUNT(*) FILTER (WHERE status = 'RESOLVED')::int,
              COUNT(*) FILTER (WHERE status IN ('OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'DISPUTED'))::int,
              COUNT(*) FILTER (WHERE status = 'DISPUTED' OR has_dispute)::int,
              COUNT(*) FILTER (WHERE resp_h IS NOT NULL)::int,
              COUNT(*) FILTER (WHERE res_h IS NOT NULL)::int,
              ARRAY[
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h <= 1)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 1 AND resp_h <= 4)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 4 AND resp_h <= 12)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 12 AND resp_h <= 24)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 24 AND resp_h <= 48)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 48 AND resp_h <= 168)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 168 AND resp_h <= 720)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 720)::int
              ]::int[],
              ARRAY[
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h <= 1)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 1 AND res_h <= 4)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 4 AND res_h <= 12)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 12 AND res_h <= 24)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 24 AND res_h <= 48)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 48 AND res_h <= 168)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 168 AND res_h <= 720)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 720)::int
              ]::int[],
              ARRAY[
                COUNT(*) FILTER (WHERE pressure <= 5)::int,
                COUNT(*) FILTER (WHERE pressure > 5 AND pressure <= 10)::int,
                COUNT(*) FILTER (WHERE pressure > 10 AND pressure <= 25)::int,
                COUNT(*) FILTER (WHERE pressure > 25 AND pressure <= 50)::int,
                COUNT(*) FILTER (WHERE pressure > 50 AND pressure <= 100)::int,
                COUNT(*) FILTER (WHERE pressure > 100 AND pressure <= 250)::int,
                COUNT(*) FILTER (WHERE pressure > 250 AND pressure <= 500)::int,
                COUNT(*) FILTER (WHERE pressure > 500 AND pressure <= 1000)::int,
                COUNT(*) FILTER (WHERE pressure > 1000)::int
              ]::int[],
              COALESCE(SUM(pressure), 0)::float8,
              COALESCE(SUM(support_cnt), 0)::int,
              COALESCE(SUM(comment_cnt), 0)::int,
              COUNT(*) FILTER (WHERE "recipientType" = 'ENTITY' AND sla_state = 'MET')::int,
              COUNT(*) FILTER (WHERE "recipientType" = 'ENTITY' AND sla_state IN ('BREACHED', 'MET_LATE'))::int,
              NOW()
            FROM filtered_reports
            GROUP BY day, state, city_key, cell7, category
          `,
        )

        const insertedRecipient = await tx.$executeRaw(
          Prisma.sql`
            WITH filtered_reports AS (
              SELECT
                r.id,
                (r."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS day,
                r."recipientType",
                r."recipientId",
                r.category,
                r.status::text AS status,
                GREATEST(0, COALESCE(r."pressureScore", 0))::float8 AS pressure,
                CASE
                  WHEN r.first_response_at IS NOT NULL
                    THEN GREATEST(0, EXTRACT(EPOCH FROM (r.first_response_at - r."createdAt")) / 3600.0)
                  ELSE NULL
                END AS resp_h,
                CASE
                  WHEN r.resolved_at IS NOT NULL
                    THEN GREATEST(0, EXTRACT(EPOCH FROM (r.resolved_at - r."createdAt")) / 3600.0)
                  ELSE NULL
                END AS res_h,
                EXISTS (
                  SELECT 1 FROM "timeline_events" te
                  WHERE te."reportId" = r.id AND te.type = 'DISPUTED'
                ) AS has_dispute,
                (SELECT COUNT(*)::int FROM "votes" v WHERE v."reportId" = r.id) AS support_cnt,
                (SELECT COUNT(*)::int FROM "comments" c WHERE c."reportId" = r.id) AS comment_cnt,
                r.sla_state::text AS sla_state
              FROM "reports" r
              WHERE r."recipientType" IS NOT NULL
                AND r."recipientId" IS NOT NULL
                AND (r."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ANY(${uniqueDays}::date[])
            )
            INSERT INTO "recipient_metrics_daily" (
              "id", "day", "recipient_type", "recipient_id", "category",
              "created_count", "resolved_count", "open_current_count", "contested_count",
              "response_count", "resolution_duration_count",
              "resp_buckets", "res_buckets", "pressure_buckets",
              "pressure_sum", "support_count", "comment_count",
              "sla_met_count", "sla_breached_count", "updated_at"
            )
            SELECT
              gen_random_uuid()::text,
              day,
              "recipientType",
              "recipientId",
              category,
              COUNT(*)::int,
              COUNT(*) FILTER (WHERE status = 'RESOLVED')::int,
              COUNT(*) FILTER (WHERE status IN ('OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'DISPUTED'))::int,
              COUNT(*) FILTER (WHERE status = 'DISPUTED' OR has_dispute)::int,
              COUNT(*) FILTER (WHERE resp_h IS NOT NULL)::int,
              COUNT(*) FILTER (WHERE res_h IS NOT NULL)::int,
              ARRAY[
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h <= 1)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 1 AND resp_h <= 4)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 4 AND resp_h <= 12)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 12 AND resp_h <= 24)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 24 AND resp_h <= 48)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 48 AND resp_h <= 168)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 168 AND resp_h <= 720)::int,
                COUNT(*) FILTER (WHERE resp_h IS NOT NULL AND resp_h > 720)::int
              ]::int[],
              ARRAY[
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h <= 1)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 1 AND res_h <= 4)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 4 AND res_h <= 12)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 12 AND res_h <= 24)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 24 AND res_h <= 48)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 48 AND res_h <= 168)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 168 AND res_h <= 720)::int,
                COUNT(*) FILTER (WHERE res_h IS NOT NULL AND res_h > 720)::int
              ]::int[],
              ARRAY[
                COUNT(*) FILTER (WHERE pressure <= 5)::int,
                COUNT(*) FILTER (WHERE pressure > 5 AND pressure <= 10)::int,
                COUNT(*) FILTER (WHERE pressure > 10 AND pressure <= 25)::int,
                COUNT(*) FILTER (WHERE pressure > 25 AND pressure <= 50)::int,
                COUNT(*) FILTER (WHERE pressure > 50 AND pressure <= 100)::int,
                COUNT(*) FILTER (WHERE pressure > 100 AND pressure <= 250)::int,
                COUNT(*) FILTER (WHERE pressure > 250 AND pressure <= 500)::int,
                COUNT(*) FILTER (WHERE pressure > 500 AND pressure <= 1000)::int,
                COUNT(*) FILTER (WHERE pressure > 1000)::int
              ]::int[],
              COALESCE(SUM(pressure), 0)::float8,
              COALESCE(SUM(support_cnt), 0)::int,
              COALESCE(SUM(comment_cnt), 0)::int,
              COUNT(*) FILTER (WHERE "recipientType" = 'ENTITY' AND sla_state = 'MET')::int,
              COUNT(*) FILTER (WHERE "recipientType" = 'ENTITY' AND sla_state IN ('BREACHED', 'MET_LATE'))::int,
              NOW()
            FROM filtered_reports
            GROUP BY day, "recipientType", "recipientId", category
          `,
        )

        return {
          areaRows: Number(insertedArea),
          recipientRows: Number(insertedRecipient),
        }
      },
      { timeout: 60_000 },
    )

    return {
      days: uniqueDays.length,
      areaRows,
      recipientRows,
    }
  }

  async rebuildRecurrence(windowEndStr: string): Promise<number> {
    const windowStartStr = addDaysDateString(windowEndStr, -(RECURRENCE_WINDOW_DAYS - 1))

    const inserted = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM "recurrence_cells" WHERE "window_end" = ${windowEndStr}::date`,
        )

        return tx.$executeRaw(
          Prisma.sql`
            INSERT INTO "recurrence_cells" (
              "id", "state", "city_key", "cell7", "category", "window_end",
              "count_90d", "first_seen", "last_seen", "avg_gap_days", "updated_at"
            )
            SELECT
              gen_random_uuid()::text,
              UPPER(COALESCE(state, '')),
              COALESCE(city_key, ''),
              cell7,
              category,
              ${windowEndStr}::date,
              COUNT(*)::int,
              MIN("createdAt"),
              MAX("createdAt"),
              CASE
                WHEN COUNT(*) > 1 THEN
                  EXTRACT(EPOCH FROM (MAX("createdAt") - MIN("createdAt"))) / 86400.0 / (COUNT(*) - 1)
                ELSE NULL
              END,
              NOW()
            FROM "reports"
            WHERE cell7 IS NOT NULL
              AND ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${windowStartStr}::date
              AND ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date <= ${windowEndStr}::date
            GROUP BY UPPER(COALESCE(state, '')), COALESCE(city_key, ''), cell7, category
            HAVING COUNT(*) >= ${RECURRENCE_MIN_REPORTS}
          `,
        )
      },
      { timeout: 60_000 },
    )

    return Number(inserted)
  }

  async backfillRange(fromDayStr: string, toDayStr: string) {
    const totalDays = diffDaysBetweenStrings(fromDayStr, toDayStr) + 1
    if (totalDays <= 0) {
      return { days: 0, areaRows: 0, recipientRows: 0, recurrenceRows: 0 }
    }

    const allDays: string[] = []
    for (let i = 0; i < totalDays; i++) {
      allDays.push(addDaysDateString(fromDayStr, i))
    }

    let areaRows = 0
    let recipientRows = 0
    for (let i = 0; i < allDays.length; i += 30) {
      const res = await this.rebuildDays(allDays.slice(i, i + 30))
      areaRows += res.areaRows
      recipientRows += res.recipientRows
    }

    const recurrenceRows = await this.rebuildRecurrence(toDayStr)
    await this.invalidateCache()

    this.logger.log(
      `[analytics-backfill] range=${fromDayStr}..${toDayStr} days=${allDays.length} areaRows=${areaRows} recipientRows=${recipientRows} recurrenceRows=${recurrenceRows}`,
    )

    return { days: allDays.length, areaRows, recipientRows, recurrenceRows }
  }

  async runHourlyIncremental(): Promise<{ days: number; areaRows: number; recurrenceRows: number }> {
    const today = toSaoPauloDateString(new Date())
    const yesterday = addDaysDateString(today, -1)
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000)

    const touchedRows = await this.prisma.$queryRaw<Array<{ day: string }>>(
      Prisma.sql`
        SELECT DISTINCT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS day
        FROM "reports"
        WHERE "updatedAt" >= ${twoHoursAgo}
           OR id IN (SELECT DISTINCT "reportId" FROM "votes" WHERE "createdAt" >= ${twoHoursAgo})
           OR id IN (SELECT DISTINCT "reportId" FROM "comments" WHERE "createdAt" >= ${twoHoursAgo})
      `,
    )

    const daysToProcess = Array.from(
      new Set([today, yesterday, ...touchedRows.map((r) => r.day)]),
    )
    const res = await this.rebuildDays(daysToProcess)
    const recurrenceRows = await this.rebuildRecurrence(today)
    await this.invalidateCache()

    this.logger.log(
      `[analytics-hourly] days=${res.days} areaRows=${res.areaRows} recurrenceRows=${recurrenceRows}`,
    )

    return { days: res.days, areaRows: res.areaRows, recurrenceRows }
  }

  async reconcileSample(dayStrings?: string[]): Promise<ReconciliationResult> {
    const today = toSaoPauloDateString(new Date())
    const targetDays =
      dayStrings && dayStrings.length > 0
        ? dayStrings
        : (
            await this.prisma.$queryRaw<Array<{ day: string }>>(
              Prisma.sql`
                SELECT DISTINCT to_char("day", 'YYYY-MM-DD') AS day
                FROM "area_metrics_daily"
                ORDER BY day DESC
                LIMIT 7
              `,
            )
          ).map((r) => r.day)

    if (targetDays.length === 0) {
      return { daysChecked: 0, mismatches: [], passed: true }
    }

    const rawTotals = await this.prisma.$queryRaw<
      Array<{ day: string; created: number; resolved: number; responded: number; openCurrent: number; slaMet: number; slaBreached: number }>
    >(
      Prisma.sql`
        SELECT
          to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS created,
          COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
          COUNT(*) FILTER (WHERE first_response_at IS NOT NULL)::int AS responded,
          COUNT(*) FILTER (WHERE status IN ('OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'DISPUTED'))::int AS "openCurrent",
          COUNT(*) FILTER (WHERE "recipientType" = 'ENTITY' AND sla_state = 'MET')::int AS "slaMet",
          COUNT(*) FILTER (WHERE "recipientType" = 'ENTITY' AND sla_state IN ('BREACHED', 'MET_LATE'))::int AS "slaBreached"
        FROM "reports"
        WHERE ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ANY(${targetDays}::date[])
        GROUP BY 1
      `,
    )

    const rollupTotals = await this.prisma.$queryRaw<
      Array<{ day: string; created: number; resolved: number; responded: number; openCurrent: number; slaMet: number; slaBreached: number }>
    >(
      Prisma.sql`
        SELECT
          to_char("day", 'YYYY-MM-DD') AS day,
          COALESCE(SUM("created_count"), 0)::int AS created,
          COALESCE(SUM("resolved_count"), 0)::int AS resolved,
          COALESCE(SUM("response_count"), 0)::int AS responded,
          COALESCE(SUM("open_current_count"), 0)::int AS "openCurrent",
          COALESCE(SUM("sla_met_count"), 0)::int AS "slaMet",
          COALESCE(SUM("sla_breached_count"), 0)::int AS "slaBreached"
        FROM "area_metrics_daily"
        WHERE "day" = ANY(${targetDays}::date[])
        GROUP BY 1
      `,
    )

    const rawMap = new Map(rawTotals.map((r) => [r.day, r]))
    const rollupMap = new Map(rollupTotals.map((r) => [r.day, r]))
    const mismatches: ReconciliationResult['mismatches'] = []

    for (const day of targetDays) {
      const raw = rawMap.get(day) ?? { day, created: 0, resolved: 0, responded: 0, openCurrent: 0, slaMet: 0, slaBreached: 0 }
      const roll = rollupMap.get(day) ?? { day, created: 0, resolved: 0, responded: 0, openCurrent: 0, slaMet: 0, slaBreached: 0 }

      for (const field of ['created', 'resolved', 'responded', 'openCurrent', 'slaMet', 'slaBreached'] as const) {
        if (raw[field] !== roll[field]) {
          mismatches.push({ day, field, rawValue: raw[field], rollupValue: roll[field] })
        }
      }
    }

    const passed = mismatches.length === 0
    if (!passed) {
      this.logger.error(
        `[analytics-reconcile] Divergência detectada em ${mismatches.length} métrica(s): ${JSON.stringify(mismatches)} (days=${targetDays.join(',')})`,
      )
    } else {
      this.logger.log(
        `[analytics-reconcile] OK daysChecked=${targetDays.length} mismatches=0 (today=${today})`,
      )
    }

    return { daysChecked: targetDays.length, mismatches, passed }
  }

  async runNightlyRebuildAndReconcile(): Promise<void> {
    const today = toSaoPauloDateString(new Date())
    const activeDays = await this.prisma.$queryRaw<Array<{ day: string }>>(
      Prisma.sql`
        SELECT DISTINCT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS day
        FROM "reports"
        ORDER BY day ASC
      `,
    )

    const dayList = activeDays.map((d) => d.day)
    if (dayList.length > 0) {
      for (let i = 0; i < dayList.length; i += 30) {
        await this.rebuildDays(dayList.slice(i, i + 30))
      }
    }

    await this.rebuildRecurrence(today)
    await this.invalidateCache()
    await this.reconcileSample(dayList.slice(-7))
  }
}
