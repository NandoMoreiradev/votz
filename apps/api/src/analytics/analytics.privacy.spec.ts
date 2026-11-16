import { Category, RecipientType } from '@prisma/client'
import { MIN_CELL_SIZE } from '@votz/shared-types'
import { ActingUser } from '../auth/acting-org'
import { AnalyticsRepository, SummaryRollupRow } from './analytics.repository'
import { AnalyticsScopeService, ResolvedTerritorialScope } from './analytics.scope'
import { AnalyticsService } from './analytics.service'
import { AnalyticsScopeMode, ExportFormat, PeriodPreset, TimeseriesGranularity, TimeseriesMetric } from './dto/analytics-query.dto'

const FORBIDDEN_PII_KEYS = new Set([
  'authorId',
  'author',
  'email',
  'phone',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'cpf',
  'cnpj',
  'passwordHash',
  'street',
  'zipCode',
  'neighborhood',
])

function walkAndAssertNoPii(node: unknown, path = 'root') {
  if (Array.isArray(node)) {
    node.forEach((item, idx) => walkAndAssertNoPii(item, `${path}[${idx}]`))
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (FORBIDDEN_PII_KEYS.has(key)) {
        throw new Error(`Chave proibida encontrada em ${path}.${key}`)
      }
      walkAndAssertNoPii(value, `${path}.${key}`)
    }
  }
}

describe('AnalyticsService Privacy & K-Anonymity Invariants', () => {
  const user: ActingUser = {
    id: 'user-org',
    type: 'ENTITY',
    ctx: { type: 'ENTITY', id: 'org-priv', name: 'Cidade Pequena', logoUrl: null, permissions: [] },
  }

  const scope: ResolvedTerritorialScope = {
    orgType: 'ENTITY',
    orgId: 'org-priv',
    orgName: 'Cidade Pequena',
    plan: 'INTEGRACAO',
    scopeMode: AnalyticsScopeMode.AREA,
    territoryLevel: 'CITY',
    state: 'SC',
    cityKey: 'cidade pequena',
    historyDays: null,
    from: '2026-10-17',
    to: '2026-11-15',
    cellFilter: null,
    recipientType: RecipientType.ENTITY,
  }

  it('never leaks PII keys or unmasked cell counts below MIN_CELL_SIZE (including anonymous reports)', async () => {
    const smallSummary: SummaryRollupRow = {
      createdCount: 4, // relatos anônimos e pequenos < 10
      resolvedCount: 2,
      openCurrentCount: 2,
      openOver7dCount: 1,
      contestedCount: 0,
      responseCount: 3,
      resolutionDurationCount: 2,
      supportCount: 9,
      commentCount: 2,
      slaMetCount: 0,
      slaBreachedCount: 0,
      pressureSum: 24,
      respBuckets: [1, 2, 0, 0, 0, 0, 0, 0],
      resBuckets: [0, 1, 1, 0, 0, 0, 0, 0],
      pressureBuckets: [2, 2, 0, 0, 0, 0, 0, 0, 0],
    }

    const repo = {
      fetchAreaSummary: jest.fn().mockResolvedValue(smallSummary),
      fetchDirectedSummary: jest.fn().mockResolvedValue(smallSummary),
      fetchOpenByDay: jest.fn().mockResolvedValue([{ day: '2026-11-01', openCurrentCount: 2 }]),
      fetchTopPressureCells: jest.fn().mockResolvedValue([]),
      fetchCategoryBreakdown: jest.fn().mockResolvedValue([
        {
          category: Category.HEALTH,
          ...smallSummary,
        },
      ]),
      fetchDailySeries: jest.fn().mockResolvedValue([
        {
          day: '2026-11-10',
          createdCount: 4,
          resolvedCount: 2,
          openCurrentCount: 2,
          openOver7dCount: 1,
          responseCount: 3,
          supportCount: 9,
          commentCount: 2,
        },
      ]),
      fetchHeatmapCells: jest.fn().mockResolvedValue({
        visibleCells: [],
        suppressedCellsCount: 1,
        suppressedVolume: 4,
      }),
      fetchLatestRecurrenceWindow: jest.fn().mockResolvedValue({
        windowEnd: new Date('2026-11-15T00:00:00.000Z'),
        visibleTotal: 0,
        allRecurrentCellsCount: 1,
        allRecurrentVolume: 4,
        suppressedCellsCount: 1,
        total90dVolume: 4,
        visibleRows: [],
      }),
      fetchOutbreaks: jest.fn().mockResolvedValue({
        total: 1,
        items: [
          {
            id: 'o-small',
            city: 'Cidade Pequena',
            state: 'SC',
            category: Category.HEALTH,
            count: 5,
            active: true,
            detectedAt: new Date('2026-11-10T00:00:00.000Z'),
            updatedAt: new Date('2026-11-10T00:00:00.000Z'),
          },
        ],
      }),
      fetchExportRows: jest.fn().mockResolvedValue([]),
      findPublicEntityMeta: jest.fn().mockResolvedValue({
        id: 'org-priv',
        legalName: 'Prefeitura Cidade Pequena',
        state: 'SC',
        city: 'Cidade Pequena',
      }),
      findPublicPoliticianMeta: jest.fn().mockResolvedValue({
        id: 'pol-priv',
        name: 'Vereador Teste',
        office: 'VEREADOR',
        state: 'SC',
        city: 'Cidade Pequena',
      }),
      findCityDisplayName: jest.fn().mockResolvedValue('Cidade Pequena'),
    } as unknown as AnalyticsRepository

    const scopeService = {
      resolveOrgScope: jest.fn().mockResolvedValue(scope),
    } as unknown as AnalyticsScopeService

    const service = new AnalyticsService(repo, scopeService)

    const responses = await Promise.all([
      service.getOverview(user, { period: PeriodPreset.D30 }),
      service.getCategories(user, { period: PeriodPreset.D30 }),
      service.getTimeseries(user, {
        metric: TimeseriesMetric.VOLUME,
        granularity: TimeseriesGranularity.DAY,
      }),
      service.getHeatmap(user, { period: PeriodPreset.D30 }),
      service.getRecurrence(user, { page: 1, limit: 25 }),
      service.getResponseTimes(user, { period: PeriodPreset.D30 }),
      service.getOutbreaks(user, { page: 1, limit: 25 }),
      service.exportData(user, { format: ExportFormat.JSON }),
      service.getPublicMunicipality({ state: 'SC', city: 'Cidade Pequena', period: PeriodPreset.D30 }),
      service.getPublicEntity('org-priv', { period: PeriodPreset.D30 }),
      service.getPublicPolitician('pol-priv', { period: PeriodPreset.D30 }),
    ])

    for (const payload of responses) {
      walkAndAssertNoPii(payload)
    }

    const [overview, categories, timeseries, heatmap, recurrence, respTimes, outbreaks, exported, pubMun, pubEnt, pubPol] =
      responses as any[]

    expect(overview.suppressed).toBe(true)
    expect(overview.sampleSize).toBeNull()
    expect(overview.kpis.volume).toBeNull()

    expect(categories.suppressed).toBe(true)
    expect(categories.items[0].suppressed).toBe(true)
    expect(categories.items[0].volume).toBeNull()

    expect(timeseries.points[0].suppressed).toBe(true)
    expect(timeseries.points[0].value).toBeNull()

    expect(heatmap.cells).toEqual([])
    expect(heatmap.suppressedCells).toBe(1)

    expect(recurrence.items).toEqual([])
    expect(recurrence.suppressed).toBe(true)
    expect(recurrence.recurrenceIndex.value).toBeNull()

    expect(respTimes.overall.suppressed).toBe(true)
    expect(respTimes.overall.firstResponseBuckets.every((b: any) => b.count === null)).toBe(true)

    expect(outbreaks.items[0].suppressed).toBe(true)
    expect(outbreaks.items[0].reportCount).toBeNull()

    expect(exported.data.rows).toEqual([])
    expect(exported.data.sampleSize).toBeNull()

    expect(pubMun.suppressed).toBe(true)
    expect(pubMun.kpis.volume).toBeNull()
    expect(pubEnt.suppressed).toBe(true)
    expect(pubPol.suppressed).toBe(true)
    expect(MIN_CELL_SIZE).toBe(10)
  })
})
