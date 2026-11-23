import { AdsDeliveryRepository, IMPRESSION_FLUSH_MS } from './ads-delivery.repository'

/** A exibição é gravada sem transação e o contador do dia sobe em lote (ver `createImpression`). */
describe('AdsDeliveryRepository: contador de exibições em lote', () => {
  const base = { adSetId: 'set-1', userId: 'u1', surface: 'FEED_FOR_YOU', position: 8, chargeOn: 'VIEWABLE_IMPRESSION' as const, chargeMillicents: 600, clickToken: 't', day: '2026-11-23' }

  function setup() {
    const prisma = {
      adImpression: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: `imp-${data.adId}`, ...data })) },
      adDailyStat: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    }
    const repo = new AdsDeliveryRepository(prisma as never, {} as never)
    return { prisma, repo }
  }

  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('grava a exibição sem abrir transação e sem tocar no contador na hora', async () => {
    const { prisma, repo } = setup()
    const created = await repo.createImpression({ ...base, adId: 'ad-1' })
    expect(created.id).toBe('imp-ad-1')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.adImpression.create).toHaveBeenCalledTimes(1)
    // adSetId e day só servem ao contador: não vão para a linha da exibição.
    expect(prisma.adImpression.create.mock.calls[0][0].data).not.toHaveProperty('adSetId')
    expect(prisma.adImpression.create.mock.calls[0][0].data).not.toHaveProperty('day')
    expect(prisma.adDailyStat.upsert).not.toHaveBeenCalled()
    await repo.flushImpressionCounts()
  })

  it('junta as exibições do mesmo anúncio e dia numa escrita só', async () => {
    const { prisma, repo } = setup()
    for (let i = 0; i < 100; i += 1) await repo.createImpression({ ...base, adId: 'ad-1' })
    await repo.createImpression({ ...base, adId: 'ad-2' })
    await jest.advanceTimersByTimeAsync(IMPRESSION_FLUSH_MS + 10)
    expect(prisma.adDailyStat.upsert).toHaveBeenCalledTimes(2)
    const byAd = new Map(prisma.adDailyStat.upsert.mock.calls.map(([arg]) => [arg.where.adId_day.adId, arg]))
    expect(byAd.get('ad-1')?.update).toEqual({ impressions: { increment: 100 } })
    expect(byAd.get('ad-1')?.create).toMatchObject({ adId: 'ad-1', adSetId: 'set-1', impressions: 100 })
    expect(byAd.get('ad-2')?.update).toEqual({ impressions: { increment: 1 } })
  })

  it('dias diferentes do mesmo anúncio não se misturam', async () => {
    const { prisma, repo } = setup()
    await repo.createImpression({ ...base, adId: 'ad-1', day: '2026-11-23' })
    await repo.createImpression({ ...base, adId: 'ad-1', day: '2026-11-24' })
    await repo.flushImpressionCounts()
    expect(prisma.adDailyStat.upsert).toHaveBeenCalledTimes(2)
  })

  it('se a gravação falha, a contagem volta e entra no próximo ciclo (nada se perde nem dobra)', async () => {
    const { prisma, repo } = setup()
    prisma.adDailyStat.upsert.mockRejectedValueOnce(new Error('banco fora'))
    await repo.createImpression({ ...base, adId: 'ad-1' })
    await repo.createImpression({ ...base, adId: 'ad-1' })
    await repo.flushImpressionCounts()
    expect(prisma.adDailyStat.upsert).toHaveBeenCalledTimes(1)

    await repo.createImpression({ ...base, adId: 'ad-1' }) // chega enquanto a falha ainda está guardada
    await repo.flushImpressionCounts()
    expect(prisma.adDailyStat.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.adDailyStat.upsert.mock.calls[1][0].update).toEqual({ impressions: { increment: 3 } })

    await repo.flushImpressionCounts()
    expect(prisma.adDailyStat.upsert).toHaveBeenCalledTimes(2) // buffer vazio: nada de gravar de novo
  })

  it('ao desligar o processo, descarrega o que ainda estava no buffer', async () => {
    const { prisma, repo } = setup()
    await repo.createImpression({ ...base, adId: 'ad-1' })
    await repo.onModuleDestroy()
    expect(prisma.adDailyStat.upsert).toHaveBeenCalledTimes(1)
  })

  it('se a exibição não foi gravada, nada é contado', async () => {
    const { prisma, repo } = setup()
    prisma.adImpression.create.mockRejectedValueOnce(new Error('falhou'))
    await expect(repo.createImpression({ ...base, adId: 'ad-1' })).rejects.toThrow('falhou')
    await repo.flushImpressionCounts()
    expect(prisma.adDailyStat.upsert).not.toHaveBeenCalled()
  })
})
