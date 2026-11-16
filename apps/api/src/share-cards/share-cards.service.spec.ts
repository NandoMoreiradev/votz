import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ShareCardFormat } from '@prisma/client'
import { ShareCardRendererService } from './share-card-renderer.service'
import { ShareCardsService } from './share-cards.service'

describe('ShareCardRendererService & ShareCardsService', () => {
  it('renders crisp 1080x1350 Feed and 1080x1920 Stories factual PNGs using bundled fonts', async () => {
    const renderer = new ShareCardRendererService()

    const feedPng = await renderer.renderPng({
      format: ShareCardFormat.FEED,
      politicianName: 'Carlos Mendes',
      roleLabel: 'Vereador (MDB)',
      territoryLabel: 'São Paulo / SP',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      received: 92,
      resolved: 54,
      medianResponseHours: 16,
      suppressed: false,
      publicUrl: 'votz.org.br/p/pol-1/mandato',
    })

    expect(feedPng.subarray(0, 4).toString('hex')).toBe('89504e47')
    expect(feedPng.length).toBeGreaterThan(5000)

    const storiesPng = await renderer.renderPng({
      format: ShareCardFormat.STORIES,
      politicianName: 'Carlos Mendes',
      roleLabel: 'Vereador (MDB)',
      territoryLabel: 'São Paulo / SP',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      received: 92,
      resolved: 54,
      medianResponseHours: 16,
      suppressed: false,
      publicUrl: 'votz.org.br/p/pol-1/mandato',
    })
    expect(storiesPng.subarray(0, 4).toString('hex')).toBe('89504e47')
    expect(storiesPng.length).toBeGreaterThan(5000)
  })

  it('caches cards by metricsHash, respects monthly quota, and exposes public OG HTML without PII', async () => {
    const cacheRows = new Map<string, { imageKey: string; metricsHash: string }>()
    const storedBuffers = new Map<string, Buffer>()
    let monthUsedCount = 0

    const prisma = {
      politician: {
        findUnique: jest.fn(async () => ({
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Carlos Mendes',
          office: 'Vereador',
          state: 'SP',
          city: 'São Paulo',
          party: { abbreviation: 'MDB' },
          plan: 'MANDATO',
          status: 'ATIVO',
        })),
      },
      shareCardCache: {
        findUnique: jest.fn(async ({ where }: { where: { politicianId_format_periodStart_periodEnd_metricsHash: Record<string, string> } }) => {
          const k = Object.values(where.politicianId_format_periodStart_periodEnd_metricsHash).join(':')
          return cacheRows.get(k) ?? null
        }),
        upsert: jest.fn(async ({ where, create }: { where: { politicianId_format_periodStart_periodEnd_metricsHash: Record<string, string> }; create: { imageKey: string; metricsHash: string } }) => {
          const k = Object.values(where.politicianId_format_periodStart_periodEnd_metricsHash).join(':')
          cacheRows.set(k, { imageKey: create.imageKey, metricsHash: create.metricsHash })
          monthUsedCount++
          return create
        }),
        count: jest.fn(async () => monthUsedCount),
      },
      moderationAction: {
        create: jest.fn(async () => ({})),
      },
    } as any

    const scopeService = {
      resolveOrgScope: jest.fn(async () => ({
        orgType: 'POLITICIAN',
        orgId: '11111111-1111-4111-8111-111111111111',
        plan: 'MANDATO',
      })),
    } as any

    const analyticsRepo = {
      fetchAreaSummary: jest.fn(async () => ({
        createdCount: 40,
        resolvedCount: 25,
        responseCount: 30,
        openCurrentCount: 15,
        openOver7dCount: 5,
        contestedCount: 0,
        resolutionDurationCount: 25,
        respBuckets: [5, 10, 10, 5, 0, 0, 0, 0],
        resBuckets: [2, 8, 10, 5, 0, 0, 0, 0],
        pressureSum: 1200,
        supportCount: 200,
        commentCount: 50,
      })),
    } as any

    const storage = {
      uploadBuffer: jest.fn(async (key: string, body: Buffer) => {
        storedBuffers.set(key, body)
        return key
      }),
      getObjectBuffer: jest.fn(async (key: string) => storedBuffers.get(key) ?? null),
    } as any

    const service = new ShareCardsService(
      prisma,
      scopeService,
      analyticsRepo,
      new ShareCardRendererService(),
      storage,
      { get: () => 'https://votz.org.br' } as any,
      { add: jest.fn() } as any,
    )

    const user = { id: 'u-1', type: 'POLITICIAN' as const }
    const gen1 = await service.generateCard(user, {
      format: ShareCardFormat.FEED,
      from: '2026-10-01',
      to: '2026-10-31',
    })
    expect(gen1.cached).toBe(false)

    // Segunda chamada com mesmas métricas usa cache e não consome nova geração
    const gen2 = await service.generateCard(user, {
      format: ShareCardFormat.FEED,
      from: '2026-10-01',
      to: '2026-10-31',
    })
    expect(gen2.cached).toBe(true)

    const ogHtml = await service.renderOgHtml(
      '11111111-1111-4111-8111-111111111111',
      ShareCardFormat.FEED,
      '2026-10-01',
      '2026-10-31',
    )
    expect(ogHtml).toContain('property="og:image"')
    expect(ogHtml).toContain('40 relatos recebidos e 25 resolvidos')

    // Ao atingir cota mensal (MANDATO = 10), novo cartão inédito é bloqueado
    monthUsedCount = 10
    await expect(
      service.generateCard(user, {
        format: ShareCardFormat.STORIES,
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    ).rejects.toThrow(ForbiddenException)
  })

  it('C1 & C2: accepts only exact indexed UUIDs (no homonym scan), rejects BASICO or inactive statuses with 404', async () => {
    const findManySpy = jest.fn(async () => [])
    const politicians: Record<string, Record<string, unknown>> = {
      '11111111-1111-4111-8111-111111111111': {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'João Silva',
        office: 'Vereador',
        state: 'SP',
        city: 'São Paulo',
        party: { abbreviation: 'A' },
        plan: 'MANDATO',
        status: 'ATIVO',
      },
      '22222222-2222-4222-8222-222222222222': {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'João Silva',
        office: 'Prefeito',
        state: 'MG',
        city: 'Belo Horizonte',
        party: { abbreviation: 'B' },
        plan: 'MANDATO_PRO',
        status: 'ATIVO',
      },
      '33333333-3333-4333-8333-333333333333': {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Plano Básico Ativo',
        office: 'Vereador',
        state: 'SP',
        city: 'Campinas',
        party: { abbreviation: 'C' },
        plan: 'BASICO',
        status: 'ATIVO',
      },
      '44444444-4444-4444-8444-444444444444': {
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Mandato Encerrado Pro',
        office: 'Vereador',
        state: 'RJ',
        city: 'Niterói',
        party: { abbreviation: 'D' },
        plan: 'MANDATO_PRO',
        status: 'ENCERRADO',
      },
    }

    const prisma = {
      politician: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => politicians[where.id] ?? null),
        findMany: findManySpy,
      },
      shareCardCache: { findUnique: jest.fn(async () => null) },
    } as any

    const analyticsRepo = {
      fetchAreaSummary: jest.fn(async () => ({
        createdCount: 15,
        resolvedCount: 10,
        responseCount: 12,
        respBuckets: [3, 5, 4, 0, 0, 0, 0, 0],
      })),
    } as any

    const service = new ShareCardsService(
      prisma,
      {} as any,
      analyticsRepo,
      new ShareCardRendererService(),
      { getObjectBuffer: jest.fn(), uploadBuffer: jest.fn() } as any,
      { get: () => 'https://votz.org.br' } as any,
      { add: jest.fn() } as any,
    )

    // Slug por nome / homônimo deve retornar 404 sem nunca chamar findMany
    await expect(service.getPublicMeta('joao-silva')).rejects.toThrow(NotFoundException)
    await expect(service.getPublicMeta('slug-inexistente')).rejects.toThrow(NotFoundException)
    expect(findManySpy).not.toHaveBeenCalled()

    // Homônimos por UUID nunca se misturam
    const meta1 = await service.getPublicMeta('11111111-1111-4111-8111-111111111111')
    const meta2 = await service.getPublicMeta('22222222-2222-4222-8222-222222222222')
    expect(meta1.politician.state).toBe('SP')
    expect(meta2.politician.state).toBe('MG')

    // C2: Plano BASICO e status ENCERRADO retornam 404 nas 3 rotas públicas (meta, image, og)
    await expect(
      service.getPublicMeta('33333333-3333-4333-8333-333333333333'),
    ).rejects.toThrow(NotFoundException)
    await expect(
      service.renderOrFetchPublicImage('33333333-3333-4333-8333-333333333333'),
    ).rejects.toThrow(NotFoundException)
    await expect(
      service.renderOgHtml('33333333-3333-4333-8333-333333333333'),
    ).rejects.toThrow(NotFoundException)

    await expect(
      service.getPublicMeta('44444444-4444-4444-8444-444444444444'),
    ).rejects.toThrow(NotFoundException)
  })
})
