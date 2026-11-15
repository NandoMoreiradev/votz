import { Category, RecipientType } from '@prisma/client'
import { MIN_CELL_SIZE } from '@votz/shared-types'
import { ActingUser } from '../auth/acting-org'
import { ANALYTICS_CACHE_EPOCH_KEY } from './analytics.constants'
import { AnalyticsRepository, SummaryRollupRow } from './analytics.repository'
import { AnalyticsScopeService, ResolvedTerritorialScope } from './analytics.scope'
import { AnalyticsService } from './analytics.service'
import { AnalyticsScopeMode, ExportFormat, PeriodPreset, TimeseriesGranularity, TimeseriesMetric } from './dto/analytics-query.dto'

function makeSummary(overrides?: Partial<SummaryRollupRow>): SummaryRollupRow {
  return {
    createdCount: 25,
    resolvedCount: 15,
    openCurrentCount: 8,
    openOver7dCount: 5,
    contestedCount: 2,
    responseCount: 20,
    resolutionDurationCount: 15,
    supportCount: 60,
    commentCount: 14,
    pressureSum: 450,
    respBuckets: [5, 10, 3, 2, 0, 0, 0, 0],
    resBuckets: [0, 3, 5, 4, 2, 1, 0, 0],
    pressureBuckets: [2, 5, 10, 5, 3, 0, 0, 0, 0],
    ...overrides,
  }
}

describe('AnalyticsService', () => {
  const user: ActingUser = {
    id: 'user-1',
    type: 'ENTITY',
    ctx: { type: 'ENTITY', id: 'org-1', name: 'Org 1', logoUrl: null, permissions: [] },
  }

  const defaultScope: ResolvedTerritorialScope = {
    orgType: 'ENTITY',
    orgId: 'org-1',
    orgName: 'Prefeitura Teste',
    plan: 'GESTAO',
    scopeMode: AnalyticsScopeMode.AREA,
    territoryLevel: 'CITY',
    state: 'SP',
    cityKey: 'campinas',
    historyDays: null,
    from: '2026-10-17',
    to: '2026-11-15',
    cellFilter: null,
    recipientType: RecipientType.ENTITY,
  }

  let repo: jest.Mocked<AnalyticsRepository>
  let scopeService: jest.Mocked<AnalyticsScopeService>
  let redisMock: { get: jest.Mock; set: jest.Mock; incr: jest.Mock }
  let service: AnalyticsService

  beforeEach(() => {
    repo = {
      fetchAreaSummary: jest.fn().mockResolvedValue(makeSummary()),
      fetchDirectedSummary: jest.fn().mockResolvedValue(makeSummary()),
      fetchOpenByDay: jest.fn().mockResolvedValue([
        { day: '2026-11-10', openCurrentCount: 5 },
        { day: '2026-11-13', openCurrentCount: 3 },
      ]),
      fetchTopPressureCells: jest.fn().mockResolvedValue([
        { cell7: '6gyf4bf', category: Category.HEALTH, cityDisplay: 'Campinas', createdCount: 12, avgPressure: 32.5 },
      ]),
      fetchCategoryBreakdown: jest.fn().mockResolvedValue([
        {
          category: Category.HEALTH,
          createdCount: 18,
          resolvedCount: 10,
          openCurrentCount: 6,
          openOver7dCount: 4,
          contestedCount: 1,
          responseCount: 15,
          resolutionDurationCount: 10,
          supportCount: 40,
          commentCount: 10,
          pressureSum: 300,
          respBuckets: [4, 7, 2, 2, 0, 0, 0, 0],
          resBuckets: [0, 2, 4, 3, 1, 0, 0, 0],
        },
        {
          category: Category.SAFETY,
          createdCount: 7, // < MIN_CELL_SIZE -> deve ser suprimido
          resolvedCount: 5,
          openCurrentCount: 2,
          openOver7dCount: 1,
          contestedCount: 1,
          responseCount: 5,
          resolutionDurationCount: 5,
          supportCount: 20,
          commentCount: 4,
          pressureSum: 150,
          respBuckets: [1, 3, 1, 0, 0, 0, 0, 0],
          resBuckets: [0, 1, 1, 1, 1, 1, 0, 0],
        },
      ]),
      fetchDailySeries: jest.fn().mockResolvedValue([
        { day: '2026-11-10', createdCount: 12, resolvedCount: 6, openCurrentCount: 4, openOver7dCount: 3, responseCount: 10, supportCount: 22, commentCount: 5 },
        { day: '2026-11-11', createdCount: 4, resolvedCount: 2, openCurrentCount: 2, openOver7dCount: 0, responseCount: 3, supportCount: 8, commentCount: 2 },
      ]),
      fetchHeatmapCells: jest.fn().mockResolvedValue({
        visibleCells: [
          {
            cell7: '6gyf4bf',
            cityDisplay: 'Campinas',
            createdCount: 15,
            openCurrentCount: 4,
            resolvedCount: 10,
            contestedCount: 1,
            pressureSum: 250,
            supportCount: 35,
          },
        ],
        suppressedCellsCount: 2,
        suppressedVolume: 9,
      }),
      fetchLatestRecurrenceWindow: jest.fn().mockResolvedValue({
        windowEnd: new Date('2026-11-15T00:00:00.000Z'),
        visibleTotal: 1,
        allRecurrentCellsCount: 3,
        allRecurrentVolume: 20,
        suppressedCellsCount: 2,
        total90dVolume: 50,
        visibleRows: [
          {
            id: 'rec-1',
            state: 'SP',
            cityKey: 'campinas',
            cell7: '6gyf4bf',
            category: Category.HEALTH,
            windowEnd: new Date('2026-11-15T00:00:00.000Z'),
            count90d: 12,
            firstSeen: new Date('2026-09-01T00:00:00.000Z'),
            lastSeen: new Date('2026-11-14T00:00:00.000Z'),
            avgGapDays: 6.4,
          },
        ],
      }),
      fetchOutbreaks: jest.fn().mockResolvedValue({
        total: 1,
        items: [
          {
            id: 's-1',
            city: 'Campinas',
            state: 'SP',
            category: Category.HEALTH,
            count: 14,
            active: true,
            detectedAt: new Date('2026-11-12T10:00:00.000Z'),
            updatedAt: new Date('2026-11-12T10:00:00.000Z'),
          },
        ],
      }),
      fetchExportRows: jest.fn().mockResolvedValue([
        {
          day: '2026-11-10',
          state: 'SP',
          cityDisplay: 'Campinas',
          category: Category.HEALTH,
          createdCount: 14,
          resolvedCount: 8,
          openCurrentCount: 4,
          contestedCount: 1,
          responseCount: 12,
          supportCount: 30,
          commentCount: 5,
        },
      ]),
      findPublicEntityMeta: jest.fn().mockResolvedValue({
        id: 'org-1',
        legalName: 'Prefeitura de Campinas',
        state: 'SP',
        city: 'Campinas',
      }),
      findPublicPoliticianMeta: jest.fn().mockResolvedValue({
        id: 'pol-1',
        name: 'Maria Silva',
        office: 'VEREADOR',
        state: 'SP',
        city: 'Campinas',
      }),
      findCityDisplayName: jest.fn().mockResolvedValue('Campinas'),
    } as any

    scopeService = {
      resolveOrgScope: jest.fn().mockResolvedValue(defaultScope),
    } as any

    redisMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
    }

    service = new AnalyticsService(repo, scopeService, redisMock as any)
  })

  it('computes overview KPIs with numerators, denominators, backlog percentiles, and metadata', async () => {
    const res = await service.getOverview(user, { period: PeriodPreset.D30 })
    expect(res.suppressed).toBe(false)
    expect(res.sampleSize).toBe(25)
    expect(res.minCellSize).toBe(MIN_CELL_SIZE)
    expect(res.definitionVersion).toBe('v1.0.0')
    expect(res.kpis.resolutionRate).toEqual({ value: 75, numerator: 15, denominator: 20 })
    expect(res.kpis.responseRate).toEqual({ value: 80, numerator: 20, denominator: 25 })
    expect(res.kpis.contestRate).toEqual({ value: 11.76, numerator: 2, denominator: 17 })
    expect(res.kpis.firstResponseMedianH).toBeGreaterThan(1)
    expect(res.kpis.backlog).toBe(8)
    expect(res.kpis.backlogAgeP50H).not.toBeNull()
  })

  it('suppresses entire overview when sampleSize < MIN_CELL_SIZE (10)', async () => {
    repo.fetchAreaSummary.mockResolvedValue(makeSummary({ createdCount: 6, resolvedCount: 3 }))
    const res = await service.getOverview(user, { period: PeriodPreset.D30 })
    expect(res.suppressed).toBe(true)
    expect(res.sampleSize).toBeNull()
    expect(res.kpis.volume).toBeNull()
    expect(res.kpis.resolutionRate.value).toBeNull()
    expect(res.trends.d7.suppressed).toBe(true)
    expect(res.trends.d7.current).toBeNull()
  })

  it('suppresses categories < MIN_CELL_SIZE while showing larger categories', async () => {
    const res = await service.getCategories(user, { period: PeriodPreset.D30 })
    const health = res.items.find((i) => i.category === Category.HEALTH)
    const safety = res.items.find((i) => i.category === Category.SAFETY)
    expect(health?.suppressed).toBe(false)
    expect(health?.volume).toBe(18)
    expect(safety?.suppressed).toBe(true)
    expect(safety?.volume).toBeNull()
    expect(safety?.share.value).toBeNull()
    expect(res.suppressedCategoriesCount).toBe(1)
  })

  it('suppresses small buckets in timeseries and switches to directed scope when requested', async () => {
    scopeService.resolveOrgScope.mockResolvedValue({
      ...defaultScope,
      scopeMode: AnalyticsScopeMode.DIRECTED,
    })
    const res = await service.getTimeseries(user, {
      scope: AnalyticsScopeMode.DIRECTED,
      metric: TimeseriesMetric.VOLUME,
      granularity: TimeseriesGranularity.DAY,
    })
    expect(repo.fetchDirectedSummary).toHaveBeenCalled()
    expect(res.points[0].suppressed).toBe(false)
    expect(res.points[0].value).toBe(12)
    expect(res.points[1].suppressed).toBe(true)
    expect(res.points[1].value).toBeNull()
  })

  it('returns heatmap polygons with suppressed cell count and no exact lat/lng of reports', async () => {
    const res = await service.getHeatmap(user, { period: PeriodPreset.D30 })
    expect(res.precision).toBe(7)
    expect(res.suppressedCells).toBe(2)
    expect(res.cells).toHaveLength(1)
    expect(res.cells[0].cell7).toBe('6gyf4bf')
    expect(res.cells[0].intensity).toBe(1)
  })

  it('uses Redis epoch cache and hits cached value on subsequent calls', async () => {
    await service.getOverview(user, { period: PeriodPreset.D7 })
    expect(redisMock.set).toHaveBeenCalledTimes(1)

    const storedPayload = redisMock.set.mock.calls[0][1]
    redisMock.get.mockImplementation(async (key: string) =>
      key === ANALYTICS_CACHE_EPOCH_KEY ? '2' : storedPayload,
    )
    repo.fetchAreaSummary.mockClear()

    const cached = await service.getOverview(user, { period: PeriodPreset.D7 })
    expect(cached.definitionVersion).toBe('v1.0.0')
    expect(repo.fetchAreaSummary).not.toHaveBeenCalled()
  })

  it('exports aggregated CSV with definition header and sanitized cells', async () => {
    const csvRes = await service.exportData(user, { format: ExportFormat.CSV })
    expect(csvRes.format).toBe(ExportFormat.CSV)
    expect((csvRes as any).body).toContain('# Votz Painel de Dados - Exportacao Agregada (v1.0.0')
    expect((csvRes as any).body).toContain('2026-11-10,SP,Campinas,HEALTH,14')
  })

  it('returns public transparency payload respecting k-anonymity and peer-comparison soon stub', async () => {
    const pub = await service.getPublicMunicipality({
      state: 'SP',
      city: 'Campinas',
      period: PeriodPreset.D30,
    })
    expect(pub.suppressed).toBe(false)
    expect(pub.kpis.volume).toBe(25)

    repo.fetchDirectedSummary.mockResolvedValueOnce(makeSummary({ createdCount: 3 }))
    const smallPub = await service.getPublicEntity('org-1', { period: PeriodPreset.D30 })
    expect(smallPub.suppressed).toBe(true)
    expect(smallPub.sampleSize).toBeNull()
    expect(smallPub.kpis.volume).toBeNull()

    const peer = await service.getPeerComparison(user, { period: PeriodPreset.D30 })
    expect(peer.available).toBe(false)
    expect(peer.status).toBe('soon')
    expect(peer.reason).toBe('POPULATION_DATA_UNAVAILABLE')
    expect(peer.minPeersRequired).toBe(5)
  })
})
