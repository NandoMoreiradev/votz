import { AD_IMPRESSION_BANDS, AD_SPEND_BANDS, adDestinationHost, adImpressionBand, adSpendBand } from '@votz/shared-types'
import type { StorageService } from '../../storage/storage.service'
import { libraryWhere, type LibraryAdRecord, type AdsLibraryRepository } from './ads-library.repository'
import { AdsLibraryService, librarySince, toLibraryItem } from './ads-library.service'

const NOW = new Date('2026-11-22T15:00:00.000Z')

function record(patch: Partial<LibraryAdRecord> = {}, adSet: Partial<LibraryAdRecord['adSet']> = {}, balanceCents = 5000, campaignStatus = 'ACTIVE'): LibraryAdRecord {
  return {
    id: 'ad-1',
    adSetId: 'set-1',
    creativeId: 'cr-1',
    name: 'Anúncio',
    status: 'ACTIVE',
    reviewStatus: 'APPROVED',
    reviewNote: null,
    submittedAt: null,
    reviewedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    creative: {
      id: 'cr-1',
      accountId: 'acc-1',
      headline: 'Bolo de fubá',
      body: 'Fresquinho todo dia.',
      ctaLabel: 'Ver cardápio',
      destinationUrl: 'https://www.padaria.com.br/cardapio?utm=segredo#topo',
      createdAt: NOW,
      updatedAt: NOW,
      media: null,
    },
    adSet: {
      startAt: new Date('2026-11-01T03:00:00.000Z'),
      endAt: null,
      status: 'ACTIVE',
      states: ['SP'],
      cities: ['Campinas'],
      campaign: {
        status: campaignStatus,
        account: { balanceCents, company: { id: 'co-1', tradeName: 'Padaria Teste', username: 'padaria', logoUrl: null, verified: true } },
      },
      ...adSet,
    },
    ...patch,
  } as unknown as LibraryAdRecord
}

const storage = { getPublicUrl: (key: string) => `https://cdn.test/${key}` } as unknown as StorageService

describe('faixas da biblioteca de anúncios', () => {
  it('as faixas cobrem tudo, sem buraco nem sobreposição', () => {
    for (const bands of [AD_SPEND_BANDS, AD_IMPRESSION_BANDS]) {
      expect(bands[0].min).toBe(0)
      bands.forEach((band, index) => {
        if (index + 1 < bands.length) expect(band.max).toBe(bands[index + 1].min)
        else expect(band.max).toBeNull()
      })
    }
  })

  it('cai na faixa certa, com a borda de baixo inclusa', () => {
    expect(adSpendBand(0).label).toBe('Menos de R$ 100')
    expect(adSpendBand(9_999).label).toBe('Menos de R$ 100')
    expect(adSpendBand(10_000).label).toBe('R$ 100 a R$ 500')
    expect(adSpendBand(99_999_999).label).toBe('Mais de R$ 50.000')
    expect(adImpressionBand(999).label).toBe('Menos de 1.000')
    expect(adImpressionBand(1_000).label).toBe('1.000 a 5.000')
    expect(adImpressionBand(5_000_000).label).toBe('Mais de 1.000.000')
  })

  it('valor estranho (negativo, NaN) vai para a primeira faixa', () => {
    expect(adSpendBand(-5).min).toBe(0)
    expect(adImpressionBand(Number.NaN).min).toBe(0)
  })

  it('mostra só o domínio do destino, sem caminho nem parâmetros', () => {
    expect(adDestinationHost('https://www.padaria.com.br/cardapio?utm=segredo#topo')).toBe('padaria.com.br')
    expect(adDestinationHost('javascript:alert(1)')).toBeNull()
    expect(adDestinationHost('não é link')).toBeNull()
  })
})

describe('item da biblioteca', () => {
  it('mostra quem pagou, o texto, o período, a região e as faixas', () => {
    const item = toLibraryItem(record(), { impressions: 3_200, spendMillicents: 25_000_000 }, NOW, storage.getPublicUrl)
    expect(item).toMatchObject({
      adId: 'ad-1',
      advertiser: { name: 'Padaria Teste', username: 'padaria', verified: true },
      headline: 'Bolo de fubá',
      destinationHost: 'padaria.com.br',
      active: true,
      startedOn: '2026-11-01',
      endsOn: null,
      states: ['SP'],
      cities: ['Campinas'],
    })
    expect(item.spend.label).toBe('R$ 100 a R$ 500')
    expect(item.impressions.label).toBe('1.000 a 5.000')
  })

  it('NUNCA leva público, lance, preço, link completo nem valor exato (muro de privacidade)', () => {
    const adSet = { interests: ['food-drink'], ageBands: ['25-34'], genders: ['FEMALE'], bidCapCents: 900, dailyBudgetCents: 5000 } as unknown as LibraryAdRecord['adSet']
    const item = toLibraryItem(record({}, adSet), { impressions: 3_200, spendMillicents: 25_000_000 }, NOW, storage.getPublicUrl)
    const json = JSON.stringify(item)
    for (const proibido of ['food-drink', '25-34', 'FEMALE', 'bidCap', 'dailyBudget', 'utm=segredo', '/cardapio', '250', '3200', 'balance', 'interests']) {
      expect(json).not.toContain(proibido)
    }
  })

  it('anúncio que parou aparece como parado; sem saldo também', () => {
    expect(toLibraryItem(record({}, {}, 5000, 'PAUSED'), undefined, NOW, storage.getPublicUrl).active).toBe(false)
    expect(toLibraryItem(record({}, {}, 0), undefined, NOW, storage.getPublicUrl).active).toBe(false)
    expect(toLibraryItem(record({}, { endAt: new Date('2026-11-10T00:00:00.000Z') }), undefined, NOW, storage.getPublicUrl)).toMatchObject({ active: false, endsOn: '2026-11-09' })
  })

  it('sem exibição ainda, cai na primeira faixa', () => {
    const item = toLibraryItem(record(), undefined, NOW, storage.getPublicUrl)
    expect(item.spend.min).toBe(0)
    expect(item.impressions.min).toBe(0)
  })
})

describe('quais anúncios entram', () => {
  const where = (extra: Partial<Parameters<typeof libraryWhere>[0]> = {}) =>
    JSON.stringify(libraryWhere({ now: NOW, since: librarySince(NOW), activeOnly: false, ...extra }))

  it('só aprovados, e nunca rascunho nem recusado', () => {
    expect(where()).toContain('"reviewStatus":"APPROVED"')
  })

  it('por padrão traz os que rodam e os que tiveram exibição nos últimos 12 meses', () => {
    expect(where()).toContain('"dailyStats"')
    expect(where({ activeOnly: true })).not.toContain('"dailyStats"')
  })

  it('janela de 12 meses', () => {
    expect(librarySince(NOW).toISOString().slice(0, 10)).toBe('2025-11-22')
  })

  it('filtra por empresa e por texto', () => {
    expect(where({ company: 'padaria' })).toContain('"username"')
    expect(where({ q: 'bolo' })).toContain('"headline"')
  })
})

describe('AdsLibraryService', () => {
  function build(rows: LibraryAdRecord[]) {
    const repo = {
      list: jest.fn().mockResolvedValue(rows),
      totals: jest.fn().mockResolvedValue(new Map([['ad-1', { impressions: 12_000, spendMillicents: 60_000_000 }]])),
    } as unknown as jest.Mocked<AdsLibraryRepository>
    return { repo, service: new AdsLibraryService(repo, storage) }
  }

  it('pede um item a mais para saber se há próxima página, sem devolvê-lo', async () => {
    const rows = [record({ id: 'ad-1' }), record({ id: 'ad-2' }), record({ id: 'ad-3' })]
    const { repo, service } = build(rows)
    const result = await service.list({ limit: 2 }, NOW)
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ activeOnly: false }), 0, 3)
    expect(result.data.map((item) => item.adId)).toEqual(['ad-1', 'ad-2'])
    expect(result.meta).toEqual({ page: 1, limit: 2, hasMore: true })
  })

  it('segunda página pula a primeira; sem sobra, não há próxima', async () => {
    const { repo, service } = build([record({ id: 'ad-1' })])
    const result = await service.list({ limit: 24, page: 2 }, NOW)
    expect(repo.list).toHaveBeenCalledWith(expect.anything(), 24, 25)
    expect(result.meta.hasMore).toBe(false)
  })

  it('limite grande demais é cortado; @ do usuário é tirado; "só rodando" vai para o filtro', async () => {
    const { repo, service } = build([])
    await service.list({ limit: 500, company: '@padaria', status: 'active' }, NOW)
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ company: 'padaria', activeOnly: true }), 0, 49)
  })

  it('as faixas vêm da soma dos últimos 12 meses', async () => {
    const { service } = build([record({ id: 'ad-1' })])
    const [item] = (await service.list({}, NOW)).data
    expect(item.spend.label).toBe('R$ 500 a R$ 1.000')
    expect(item.impressions.label).toBe('10.000 a 50.000')
  })
})
