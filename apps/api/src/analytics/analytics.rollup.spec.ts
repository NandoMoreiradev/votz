import { Category, RecipientType } from '@prisma/client'
import {
  PRESSURE_BUCKET_BOUNDS,
  RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
  computePercentileFromBuckets,
  encodeGeohash7,
} from '@votz/shared-types'
import {
  RawReportForRollup,
  aggregateReportsForRollup,
} from './analytics.rollup'

describe('AnalyticsRollup pure aggregation & buckets', () => {
  it('handles zero reports returning empty arrays', () => {
    const res = aggregateReportsForRollup([])
    expect(res.areaRows).toEqual([])
    expect(res.recipientRows).toEqual([])
    expect(computePercentileFromBuckets([0, 0, 0, 0, 0, 0, 0, 0], RESPONSE_TIME_BUCKET_BOUNDS_HOURS, 50)).toBeNull()
  })

  it('handles a single report without responses correctly', () => {
    const report: RawReportForRollup = {
      id: 'r1',
      category: Category.HEALTH,
      status: 'OPEN',
      state: 'sp',
      city: 'São Paulo',
      cityKey: null,
      latitude: -23.5505,
      longitude: -46.6333,
      cell7: null,
      recipientType: null,
      recipientId: null,
      pressureScore: 12,
      createdAt: new Date('2026-11-10T15:00:00.000Z'),
      firstResponseAt: null,
      resolvedAt: null,
      supportCount: 4,
      commentCount: 1,
      hasDispute: false,
    }

    const res = aggregateReportsForRollup([report])
    expect(res.areaRows).toHaveLength(1)
    expect(res.recipientRows).toHaveLength(0)

    const row = res.areaRows[0]
    expect(row.day).toBe('2026-11-10')
    expect(row.state).toBe('SP')
    expect(row.cityKey).toBe('sao paulo')
    expect(row.cell7).toBe(encodeGeohash7(-23.5505, -46.6333))
    expect(row.createdCount).toBe(1)
    expect(row.openCurrentCount).toBe(1)
    expect(row.resolvedCount).toBe(0)
    expect(row.responseCount).toBe(0)
    expect(row.supportCount).toBe(4)
    expect(row.commentCount).toBe(1)
  })

  it('applies America/Sao_Paulo midnight boundary and month rollover accurately', () => {
    // 2026-11-01T02:30:00Z é 2026-10-31 23:30 em America/Sao_Paulo (UTC-3)
    const beforeSpMidnight: RawReportForRollup = {
      id: 'r-sp-prev',
      category: Category.MOBILITY,
      status: 'RESOLVED',
      state: 'RJ',
      city: 'Rio de Janeiro',
      cityKey: 'rio de janeiro',
      latitude: -22.9068,
      longitude: -43.1729,
      cell7: '75cm9s2',
      recipientType: RecipientType.ENTITY,
      recipientId: 'ent-1',
      pressureScore: 40,
      createdAt: new Date('2026-11-01T02:30:00.000Z'),
      firstResponseAt: new Date('2026-11-01T05:30:00.000Z'), // 3h
      resolvedAt: new Date('2026-11-02T02:30:00.000Z'), // 24h
      supportCount: 2,
      commentCount: 0,
      hasDispute: false,
    }
    // 2026-11-01T03:05:00Z é 2026-11-01 00:05 em America/Sao_Paulo
    const afterSpMidnight: RawReportForRollup = {
      ...beforeSpMidnight,
      id: 'r-sp-curr',
      createdAt: new Date('2026-11-01T03:05:00.000Z'),
    }

    const res = aggregateReportsForRollup([beforeSpMidnight, afterSpMidnight])
    const days = res.areaRows.map((a) => a.day).sort()
    expect(days).toEqual(['2026-10-31', '2026-11-01'])

    const recDays = res.recipientRows.map((r) => r.day).sort()
    expect(recDays).toEqual(['2026-10-31', '2026-11-01'])

    // Bucket 1..4h = índice 1
    expect(res.areaRows.find((a) => a.day === '2026-10-31')?.respBuckets[1]).toBe(1)
    // Bucket 12..24h = índice 3
    expect(res.areaRows.find((a) => a.day === '2026-10-31')?.resBuckets[3]).toBe(1)
  })

  it('computes p50 and p90 from response and pressure buckets', () => {
    // 10 items in 1-4h (index 1) and 2 items in 24-48h (index 4)
    const respBuckets = [0, 10, 0, 0, 2, 0, 0, 0]
    const p50 = computePercentileFromBuckets(respBuckets, RESPONSE_TIME_BUCKET_BOUNDS_HOURS, 50)
    const p90 = computePercentileFromBuckets(respBuckets, RESPONSE_TIME_BUCKET_BOUNDS_HOURS, 90)
    expect(p50).toBeGreaterThan(1)
    expect(p50).toBeLessThanOrEqual(4)
    expect(p90).toBeGreaterThan(24)

    const pressureBuckets = [2, 3, 5, 0, 0, 0, 0, 0, 0]
    const p50Press = computePercentileFromBuckets(pressureBuckets, PRESSURE_BUCKET_BOUNDS, 50)
    expect(p50Press).toBe(10)
  })
})
