import { useQuery } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { api } from '../lib/api'

export type AnalyticsScopeMode = 'area' | 'directed'
export type AnalyticsPeriodPreset = '7d' | '30d' | '90d' | '365d'
export type AnalyticsTimeseriesMetric =
  | 'volume'
  | 'resolved'
  | 'response_rate'
  | 'resolution_rate'
  | 'support'
  | 'comments'
export type AnalyticsTimeseriesGranularity = 'day' | 'week' | 'month'

export interface AnalyticsQueryParams {
  scope?: AnalyticsScopeMode
  period?: AnalyticsPeriodPreset
  from?: string
  to?: string
  category?: string
}

export interface AnalyticsRatio {
  value: number | null
  numerator: number
  denominator: number
  suppressed?: boolean
}

export interface AnalyticsScopeInfo {
  mode: AnalyticsScopeMode
  orgType: 'ENTITY' | 'POLITICIAN'
  territoryLevel: 'CITY' | 'STATE'
  state: string
  cityKey: string | null
}

export interface AnalyticsOverviewResponse {
  computedAt: string
  sampleSize: number | null
  minCellSize: number
  suppressed: boolean
  definitionVersion: string
  definitionDate: string
  timezone: string
  period: { from: string; to: string }
  scope: AnalyticsScopeInfo
  kpis: {
    volume: number | null
    resolutionRate: AnalyticsRatio
    responseRate: AnalyticsRatio
    firstResponseMedianH: number | null
    firstResponseP90H: number | null
    resolutionTimeMedianH: number | null
    resolutionTimeP90H: number | null
    backlog: number | null
    backlogAgeP50H: number | null
    backlogAgeP90H: number | null
    contestRate: AnalyticsRatio
    pressureP50: number | null
    pressureP90: number | null
    supportVolume: number | null
    commentVolume: number | null
  }
  trends: {
    d7: TrendWindow
    d30: TrendWindow
    d90: TrendWindow
  }
  topPressureCells: Array<{
    cell7: string
    category: string
    cityDisplay: string
    createdCount: number
    avgPressure: number
  }>
}

export interface TrendWindow {
  available: boolean
  days: number
  requiresFullHistory?: boolean
  suppressed?: boolean
  current?: number | null
  previous?: number | null
  deltaPercent?: number | null
  smallBaseWarning?: boolean
}

export interface AnalyticsCategoriesResponse {
  computedAt: string
  sampleSize: number | null
  minCellSize: number
  suppressed: boolean
  definitionVersion: string
  definitionDate: string
  period: { from: string; to: string }
  scope: AnalyticsScopeInfo
  suppressedCategoriesCount: number
  items: Array<{
    category: string
    suppressed: boolean
    volume: number | null
    share: AnalyticsRatio
    resolutionRate: AnalyticsRatio
    responseRate: AnalyticsRatio
    firstResponseMedianH: number | null
    resolutionTimeMedianH: number | null
    backlog: number | null
    supportVolume: number | null
    commentVolume: number | null
  }>
}

export interface AnalyticsTimeseriesResponse {
  computedAt: string
  sampleSize: number | null
  minCellSize: number
  suppressed: boolean
  definitionVersion: string
  definitionDate: string
  period: { from: string; to: string }
  scope: AnalyticsScopeInfo
  metric: AnalyticsTimeseriesMetric
  granularity: AnalyticsTimeseriesGranularity
  points: Array<{
    bucket: string
    suppressed: boolean
    value: number | null
    numerator?: number
    denominator?: number
  }>
  comparison: {
    previousPeriod: { from: string; to: string }
    current: number | null
    previous: number | null
    deltaPercent: number | null
    smallBaseWarning: boolean
    suppressed: boolean
  }
}

export interface AnalyticsHeatmapResponse {
  computedAt: string
  sampleSize: number | null
  minCellSize: number
  suppressed: boolean
  definitionVersion: string
  definitionDate: string
  period: { from: string; to: string }
  scope: AnalyticsScopeInfo
  precision: number
  suppressedCells: number
  cells: Array<{
    cell7: string
    cityDisplay: string
    bounds: {
      minLat: number
      maxLat: number
      minLng: number
      maxLng: number
      centerLat: number
      centerLng: number
    }
    count: number
    openCount: number
    resolvedCount: number
    contestedCount: number
    avgPressure: number
    supportCount: number
    intensity: number
  }>
}

export interface AnalyticsRecurrenceResponse {
  computedAt: string
  sampleSize: number | null
  minCellSize: number
  suppressed: boolean
  definitionVersion: string
  definitionDate: string
  period: { from: string; to: string }
  scope: AnalyticsScopeInfo
  windowDays: number
  windowEnd: string | null
  recurrenceIndex: AnalyticsRatio
  totalRecurrentCells: number
  suppressedCells: number
  pagination: {
    page: number
    limit: number
    totalVisible: number
    totalPages: number
  }
  items: Array<{
    cell7: string
    category: string
    state: string
    cityKey: string
    bounds: {
      centerLat: number
      centerLng: number
    } | null
    count90d: number
    firstSeen: string
    lastSeen: string
    avgGapDays: number | null
  }>
}

export interface AnalyticsResponseTimesResponse {
  computedAt: string
  sampleSize: number | null
  minCellSize: number
  suppressed: boolean
  definitionVersion: string
  definitionDate: string
  period: { from: string; to: string }
  scope: AnalyticsScopeInfo
  bucketLabels: string[]
  overall: {
    suppressed: boolean
    responseRate: AnalyticsRatio
    firstResponseMedianH: number | null
    firstResponseP90H: number | null
    resolutionTimeMedianH: number | null
    resolutionTimeP90H: number | null
    firstResponseBuckets: Array<{ label: string; count: number | null }>
    resolutionBuckets: Array<{ label: string; count: number | null }>
  }
  byCategory: Array<{
    category: string
    suppressed: boolean
    volume: number | null
    responseRate: AnalyticsRatio
    firstResponseMedianH: number | null
    firstResponseP90H: number | null
    resolutionTimeMedianH: number | null
    resolutionTimeP90H: number | null
    firstResponseBuckets: Array<{ label: string; count: number | null }>
  }>
}

export interface AnalyticsOutbreaksResponse {
  computedAt: string
  sampleSize: number | null
  definitionVersion: string
  definitionDate: string
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  items: Array<{
    id: string
    city: string
    state: string
    category: string
    reportCount: number | null
    suppressed: boolean
    active: boolean
    detectedAt: string
    updatedAt: string
  }>
}

export interface PublicAnalyticsResponse {
  subject: {
    type: 'MUNICIPALITY' | 'ENTITY' | 'POLITICIAN'
    name: string
    state: string
    city?: string | null
  }
  computedAt: string
  sampleSize: number | null
  minCellSize: number
  suppressed: boolean
  hasOwnSla?: boolean
  definitionVersion: string
  definitionDate: string
  period: { from: string; to: string }
  kpis: {
    volume: number | null
    resolutionRate: AnalyticsRatio
    firstResponseMedianH: number | null
    responseRate: AnalyticsRatio
    slaComplianceRate?: AnalyticsRatio
  }
}

export interface PlanRequiredDetails {
  code: 'PLAN_REQUIRED'
  feature?: string
  requiredPlan?: string
  currentPlan?: string
  message?: string
}

export function extractPlanRequired(error: unknown): PlanRequiredDetails | null {
  const axiosErr = error as AxiosError<{
    code?: string
    feature?: string
    requiredPlan?: string
    currentPlan?: string
    message?: string
  }>
  const data = axiosErr?.response?.data
  if (axiosErr?.response?.status === 403 && data?.code === 'PLAN_REQUIRED') {
    return {
      code: 'PLAN_REQUIRED',
      feature: data.feature,
      requiredPlan: data.requiredPlan,
      currentPlan: data.currentPlan,
      message: data.message,
    }
  }
  return null
}

function cleanParams(params: Record<string, string | number | undefined>) {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') out[k] = v
  }
  return out
}

export function useAnalyticsOverview(params: AnalyticsQueryParams, enabled = true) {
  return useQuery<AnalyticsOverviewResponse>({
    queryKey: ['analytics', 'overview', params],
    queryFn: () =>
      api
        .get('/analytics/overview', { params: cleanParams({ ...params }) })
        .then((r) => r.data),
    enabled,
    retry: (count, err) => (extractPlanRequired(err) ? false : count < 1),
  })
}

export function useAnalyticsCategories(params: AnalyticsQueryParams, enabled = true) {
  return useQuery<AnalyticsCategoriesResponse>({
    queryKey: ['analytics', 'categories', params],
    queryFn: () =>
      api
        .get('/analytics/categories', { params: cleanParams({ ...params }) })
        .then((r) => r.data),
    enabled,
    retry: (count, err) => (extractPlanRequired(err) ? false : count < 1),
  })
}

export function useAnalyticsTimeseries(
  params: AnalyticsQueryParams & {
    metric: AnalyticsTimeseriesMetric
    granularity: AnalyticsTimeseriesGranularity
  },
  enabled = true,
) {
  return useQuery<AnalyticsTimeseriesResponse>({
    queryKey: ['analytics', 'timeseries', params],
    queryFn: () =>
      api
        .get('/analytics/timeseries', { params: cleanParams({ ...params }) })
        .then((r) => r.data),
    enabled,
    retry: (count, err) => (extractPlanRequired(err) ? false : count < 1),
  })
}

export function useAnalyticsHeatmap(params: AnalyticsQueryParams, enabled = true) {
  return useQuery<AnalyticsHeatmapResponse>({
    queryKey: ['analytics', 'heatmap', params],
    queryFn: () =>
      api
        .get('/analytics/heatmap', { params: cleanParams({ ...params }) })
        .then((r) => r.data),
    enabled,
    retry: (count, err) => (extractPlanRequired(err) ? false : count < 1),
  })
}

export function useAnalyticsRecurrence(
  params: AnalyticsQueryParams & { page?: number; limit?: number },
  enabled = true,
) {
  return useQuery<AnalyticsRecurrenceResponse>({
    queryKey: ['analytics', 'recurrence', params],
    queryFn: () =>
      api
        .get('/analytics/recurrence', { params: cleanParams({ ...params }) })
        .then((r) => r.data),
    enabled,
    retry: (count, err) => (extractPlanRequired(err) ? false : count < 1),
  })
}

export function useAnalyticsResponseTimes(params: AnalyticsQueryParams, enabled = true) {
  return useQuery<AnalyticsResponseTimesResponse>({
    queryKey: ['analytics', 'response-times', params],
    queryFn: () =>
      api
        .get('/analytics/response-times', { params: cleanParams({ ...params }) })
        .then((r) => r.data),
    enabled,
    retry: (count, err) => (extractPlanRequired(err) ? false : count < 1),
  })
}

export function useAnalyticsOutbreaks(
  params: AnalyticsQueryParams & { page?: number; limit?: number },
  enabled = true,
) {
  return useQuery<AnalyticsOutbreaksResponse>({
    queryKey: ['analytics', 'outbreaks', params],
    queryFn: () =>
      api
        .get('/analytics/outbreaks', { params: cleanParams({ ...params }) })
        .then((r) => r.data),
    enabled,
    retry: (count, err) => (extractPlanRequired(err) ? false : count < 1),
  })
}

export function usePublicEntityAnalytics(id: string | undefined, period: AnalyticsPeriodPreset = '30d') {
  return useQuery<PublicAnalyticsResponse>({
    queryKey: ['analytics', 'public', 'entity', id, period],
    queryFn: () =>
      api.get(`/analytics/public/entities/${id}`, { params: { period } }).then((r) => r.data),
    enabled: !!id,
  })
}

export function usePublicPoliticianAnalytics(
  id: string | undefined,
  period: AnalyticsPeriodPreset = '30d',
) {
  return useQuery<PublicAnalyticsResponse>({
    queryKey: ['analytics', 'public', 'politician', id, period],
    queryFn: () =>
      api.get(`/analytics/public/politicians/${id}`, { params: { period } }).then((r) => r.data),
    enabled: !!id,
  })
}

export async function downloadAnalyticsExport(
  params: AnalyticsQueryParams & { format: 'csv' | 'json' },
): Promise<void> {
  const response = await api.get('/analytics/export', {
    params: cleanParams({ ...params }),
    responseType: 'blob',
  })
  const ext = params.format === 'csv' ? 'csv' : 'json'
  const blob = new Blob([response.data], {
    type: params.format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `votz-dados-${params.scope ?? 'area'}-${params.period ?? 'custom'}.${ext}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
