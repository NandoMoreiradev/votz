import { NotFoundException } from '@nestjs/common'
import { AdsDeliveryService } from './ads-delivery.service'
import { isHoldout } from './delivery-rules'

const NOW = new Date('2026-11-22T12:00:00Z')

// Pessoa que não cai no grupo de controle (sem anúncio).
const USER = (() => {
  for (let index = 0; index < 100; index += 1) if (!isHoldout(`u-${index}`, 0.05)) return `u-${index}`
  throw new Error('sem usuário fora do grupo de controle')
})()

function candidate(overrides: Record<string, unknown> = {}, set: Record<string, unknown> = {}, account: Record<string, unknown> = {}) {
  return {
    id: 'ad-1',
    adSetId: 'set-1',
    creative: { headline: 'Pão quentinho', body: 'Todo dia às 6h', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.example/' },
    adSet: {
      dailyBudgetCents: 1000,
      bidCapCents: null,
      states: [],
      cities: [],
      interests: [],
      ageBands: [],
      genders: [],
      automaticAudience: false,
      campaign: {
        objective: 'AWARENESS',
        account: {
          id: 'acc-1',
          balanceCents: 5000,
          pendingSpendMillicents: 0,
          companyId: 'co-1',
          company: { id: 'co-1', tradeName: 'Padaria', username: 'padaria', logoUrl: null },
          ...account,
        },
      },
      ...set,
    },
    ...overrides,
  }
}

function makeRepo(pool: unknown[] = [candidate()], viewer: Record<string, unknown> = {}) {
  return {
    findViewerFacts: jest.fn().mockResolvedValue({ city: 'São Paulo', state: 'SP', birthDate: null, gender: null, adPreference: null, ...viewer }),
    hiddenCompanyIds: jest.fn().mockResolvedValue([]),
    excludedAdIds: jest.fn().mockResolvedValue([]),
    findCandidates: jest.fn().mockResolvedValue(pool),
    spentTodayByAdSet: jest.fn().mockResolvedValue(new Map()),
    clickStatsByAd: jest.fn().mockResolvedValue(new Map()),
    platformClickStats: jest.fn().mockResolvedValue({ viewable: 0, clicks: 0 }),
    advertiserStats: jest.fn().mockResolvedValue(new Map()),
    createImpression: jest.fn().mockResolvedValue({ id: 'imp-1' }),
    findImpression: jest.fn(),
    countClicks: jest.fn().mockResolvedValue(0),
    applyEvent: jest.fn().mockResolvedValue(true),
    findAccount: jest.fn(),
    listAccountDailyStats: jest.fn().mockResolvedValue([]),
    listAccountAdTotals: jest.fn().mockResolvedValue([]),
    accountsWithPendingSpend: jest.fn().mockResolvedValue([]),
    closeSpend: jest.fn(),
  }
}

const query = { surface: 'FEED_FOR_YOU' as const, position: 3 }
const storage = { getPublicUrl: (key: string) => `https://cdn.test/${key}` }
const noAdjacency = () => ({ companiesTargetedNear: jest.fn().mockResolvedValue([]) })
const links = { build: (token: string) => `https://votz.test/c/${token}` }

const mediaRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'media-1', kind: 'IMAGE', status: 'READY', format: 'PORTRAIT', key: 'posts/m1.jpg', feedKey: 'posts/m1.feed.jpg', thumbKey: 'posts/m1.thumb.webp',
  posterKey: null, width: 1080, height: 1350, sourceWidth: 3000, sourceHeight: 4000, durationMs: null, legacy: false, ...overrides,
})

describe('AdsDeliveryService.next: foto e vídeo do anúncio', () => {
  const withMedia = (media: unknown) => candidate({ creative: { headline: 'Pão', body: 'Quente', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.example/', media: [media] } })

  it('anúncio só de texto entrega com media nula', async () => {
    const view = await new AdsDeliveryService(makeRepo() as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    expect(view?.media).toBeNull()
    expect(view?.mediaItems).toEqual([])
  })

  it('foto pronta vai para o feed com o endereço público da versão do feed e o formato escolhido', async () => {
    const view = await new AdsDeliveryService(makeRepo([withMedia(mediaRow())]) as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    expect(view?.media).toMatchObject({ kind: 'IMAGE', format: 'PORTRAIT', fit: 'cover', status: 'READY', url: 'https://cdn.test/posts/m1.feed.jpg', fullUrl: 'https://cdn.test/posts/m1.jpg' })
    // Nunca vaza a chave do original.
    expect(JSON.stringify(view)).not.toContain('media-src')
  })

  it('vídeo ainda preparando ou que falhou nunca é entregue (nem cobra exibição)', async () => {
    for (const status of ['PROCESSING', 'FAILED', 'UPLOADED']) {
      const repo = makeRepo([withMedia(mediaRow({ kind: 'VIDEO', status, key: null }))])
      expect(await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)).toBeNull()
      expect(repo.createImpression).not.toHaveBeenCalled()
    }
  })

})

describe('AdsDeliveryService.next: nenhum anúncio perto de relato contra o anunciante', () => {
  const POST_A = '11111111-1111-4111-8111-111111111111'
  const REPORT_B = '22222222-2222-4222-8222-222222222222'

  it('sem informação do que está em volta, não consulta nada e entrega normal', async () => {
    const repo = makeRepo()
    const adjacency = noAdjacency()
    expect(await new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never).next(USER, query, NOW)).not.toBeNull()
    expect(adjacency.companiesTargetedNear).not.toHaveBeenCalled()
  })

  it('tira da disputa as empresas que são alvo de relato nos itens em volta (junto com as escondidas)', async () => {
    const byCompany = (id: string, companyId: string) => candidate({ id }, { }, { companyId, company: { id: companyId, tradeName: id, username: id, logoUrl: null } })
    const repo = makeRepo([byCompany('ad-alvo', 'co-alvo'), byCompany('ad-escondida', 'co-escondida'), byCompany('ad-livre', 'co-livre')])
    repo.hiddenCompanyIds.mockResolvedValue(['co-escondida'])
    const adjacency = { companiesTargetedNear: jest.fn().mockResolvedValue(['co-alvo']) }
    const view = await new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never).next(USER, { ...query, nearPostIds: [POST_A], nearReportIds: [REPORT_B] }, NOW)
    expect(adjacency.companiesTargetedNear).toHaveBeenCalledWith({ postIds: [POST_A], reportIds: [REPORT_B] })
    // Só a empresa que não é alvo de relato nem foi escondida pode ganhar.
    expect(view?.adId).toBe('ad-livre')
  })

  it('só a empresa alvo de relato e a escondida na disputa: nenhum anúncio', async () => {
    const byCompany = (id: string, companyId: string) => candidate({ id }, { }, { companyId, company: { id: companyId, tradeName: id, username: id, logoUrl: null } })
    const repo = makeRepo([byCompany('ad-alvo', 'co-alvo'), byCompany('ad-escondida', 'co-escondida')])
    repo.hiddenCompanyIds.mockResolvedValue(['co-escondida'])
    const adjacency = { companiesTargetedNear: jest.fn().mockResolvedValue(['co-alvo']) }
    expect(await new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never).next(USER, { ...query, nearPostIds: [POST_A] }, NOW)).toBeNull()
    expect(repo.createImpression).not.toHaveBeenCalled()
  })

  it('os anúncios que a pessoa já escondeu ou viu demais saem da disputa (limite diário), mesmo com o conjunto compartilhado', async () => {
    const repo = makeRepo([candidate({ id: 'ad-1' }), candidate({ id: 'ad-2', adSetId: 'set-2' })])
    repo.excludedAdIds.mockResolvedValue(['ad-1'])
    expect((await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW))?.adId).toBe('ad-2')
  })

  it('se não der para conferir a vizinhança, não mostra anúncio e não conta exibição', async () => {
    const repo = makeRepo()
    const adjacency = { companiesTargetedNear: jest.fn().mockRejectedValue(new Error('banco fora')) }
    const view = await new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never).next(USER, { ...query, nearPostIds: [POST_A] }, NOW)
    expect(view).toBeNull()
    expect(repo.findCandidates).not.toHaveBeenCalled()
    expect(repo.createImpression).not.toHaveBeenCalled()
  })
})

describe('AdsDeliveryService.next', () => {
  it('entrega o anúncio e fixa o preço da exibição em millicents', async () => {
    const repo = makeRepo()
    const view = await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    expect(view).toMatchObject({ impressionId: 'imp-1', adId: 'ad-1', headline: 'Pão quentinho', advertiser: { name: 'Padaria' } })
    // Sem lance e sem concorrente: R$ 6,00 por mil = 600 millicents por exibição visível.
    expect(repo.createImpression).toHaveBeenCalledWith(expect.objectContaining({ chargeOn: 'VIEWABLE_IMPRESSION', chargeMillicents: 600, day: '2026-11-22', position: 3 }))
  })

  it('sorteia o identificador do clique na entrega e põe o endereço do botão na resposta (sem vazar o alvo)', async () => {
    const repo = makeRepo()
    const view = await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    const { clickToken } = repo.createImpression.mock.calls[0][0] as { clickToken: string }
    expect(clickToken).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(view?.clickUrl).toBe(`https://votz.test/c/${clickToken}`)
    // O identificador do clique não é a exibição: o anunciante não chega na pessoa por ele.
    expect(view?.clickUrl).not.toContain(view?.impressionId as string)
  })

  it('a resposta diz onde o botão cai: site segue por clickUrl, chat da página abre por dentro do app com o clickId', async () => {
    const site = candidate()
    ;(site.creative as Record<string, unknown>).destinationKind = 'URL'
    const siteRepo = makeRepo([site])
    const siteView = await new AdsDeliveryService(siteRepo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    expect(siteView?.destination).toEqual({ kind: 'URL' })

    const chat = candidate()
    ;(chat.creative as Record<string, unknown>).destinationKind = 'PAGE_MESSAGE'
    chat.adSet.campaign.objective = 'MESSAGES'
    const chatRepo = makeRepo([chat])
    const chatView = await new AdsDeliveryService(chatRepo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    const { clickToken } = chatRepo.createImpression.mock.calls[0][0] as { clickToken: string }
    expect(chatView?.clickId).toBe(clickToken)
    expect(chatView?.destination).toEqual({ kind: 'PAGE_MESSAGE', orgType: 'COMPANY', orgId: expect.any(String) })
    // O link de reserva continua levando ao mesmo lugar para os apps antigos.
    expect(chatView?.clickUrl).toBe(`https://votz.test/c/${clickToken}`)
  })

  it('WhatsApp: a resposta diz só o tipo; o número da empresa nunca vai no anúncio do feed', async () => {
    const wa = candidate()
    Object.assign(wa.creative, { destinationKind: 'WHATSAPP', destinationUrl: 'https://wa.me/5511987654321?text=Oi', whatsappPhone: '5511987654321', whatsappText: 'Oi' })
    wa.adSet.campaign.objective = 'MESSAGES'
    const repo = makeRepo([wa])
    const view = await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    expect(view?.destination).toEqual({ kind: 'WHATSAPP' })
    expect(JSON.stringify(view)).not.toContain('5511987654321')
    expect(view?.clickUrl).toMatch(/^https:\/\/votz\.test\/c\//)
  })

  it('mensagens cobra por clique: R$ 0,80 = 80.000 millicents', async () => {
    const messages = candidate()
    messages.adSet.campaign.objective = 'MESSAGES'
    const repo = makeRepo([messages])
    await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    expect(repo.createImpression).toHaveBeenCalledWith(expect.objectContaining({ chargeOn: 'CLICK', chargeMillicents: 80_000 }))
  })

  it('tráfego cobra por clique: R$ 0,40 = 40.000 millicents', async () => {
    const traffic = candidate()
    traffic.adSet.campaign.objective = 'TRAFFIC'
    const repo = makeRepo([traffic])
    await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    expect(repo.createImpression).toHaveBeenCalledWith(expect.objectContaining({ chargeOn: 'CLICK', chargeMillicents: 40_000 }))
  })

  it('o grupo de controle nunca vê anúncio', async () => {
    let held = 'x'
    for (let index = 0; index < 1000; index += 1) if (isHoldout(`h-${index}`, 0.05)) { held = `h-${index}`; break }
    const repo = makeRepo()
    expect(await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(held, query, NOW)).toBeNull()
    expect(repo.findCandidates).not.toHaveBeenCalled()
  })

  it('sem saldo disponível (descontado o gasto ainda não lançado) não entrega', async () => {
    const repo = makeRepo([candidate({}, {}, { balanceCents: 1, pendingSpendMillicents: 1000 })])
    expect(await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)).toBeNull()
    expect(repo.createImpression).not.toHaveBeenCalled()
  })

  it('orçamento do dia esgotado não entrega', async () => {
    const repo = makeRepo()
    repo.spentTodayByAdSet.mockResolvedValue(new Map([['set-1', 1000 * 1000 - 100]]))
    expect(await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)).toBeNull()
  })

  it('região da tela vale sem aceite; a do cadastro só com aceite', async () => {
    const sp = candidate({}, { states: ['SP'] })
    const noConsent = makeRepo([sp])
    expect(await new AdsDeliveryService(noConsent as never, storage as never, links as never, noAdjacency() as never).next(USER, { surface: 'FEED_FOR_YOU' }, NOW)).toBeNull()
    expect(await new AdsDeliveryService(noConsent as never, storage as never, links as never, noAdjacency() as never).next(USER, { surface: 'FEED_FOR_YOU', state: 'sp' }, NOW)).not.toBeNull()

    const consent = makeRepo([sp], { adPreference: { personalizationConsent: true, interests: [] } })
    expect(await new AdsDeliveryService(consent as never, storage as never, links as never, noAdjacency() as never).next(USER, { surface: 'FEED_FOR_YOU' }, NOW)).not.toBeNull()
  })

  it('interesse só com aceite, e menor de idade nunca é perfilado', async () => {
    const food = candidate({}, { interests: ['food-drink'] })
    const consented = { adPreference: { personalizationConsent: true, interests: ['food-drink'] } }
    expect(await new AdsDeliveryService(makeRepo([food]) as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)).toBeNull()
    expect(await new AdsDeliveryService(makeRepo([food], consented) as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)).not.toBeNull()

    const minor = { ...consented, birthDate: new Date('2012-05-01') }
    expect(await new AdsDeliveryService(makeRepo([food], minor) as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)).toBeNull()
  })

  it('o "por que estou vendo isto" só cita o que foi usado', async () => {
    const regional = await new AdsDeliveryService(makeRepo([candidate({}, { cities: ['São Paulo'] })]) as never, storage as never, links as never, noAdjacency() as never).next(USER, { surface: 'FEED_FOR_YOU', city: 'São Paulo' }, NOW)
    expect(regional?.why).toContain('região')
    const everyone = await new AdsDeliveryService(makeRepo() as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    expect(everyone?.why).toContain('todo mundo')
  })

  it('segundo preço entre dois anunciantes', async () => {
    const high = candidate({ id: 'ad-high' }, { bidCapCents: 2000 })
    const low = candidate({ id: 'ad-low', adSetId: 'set-2' }, { bidCapCents: 900 })
    const repo = makeRepo([high, low])
    const view = await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    expect(view?.adId).toBe('ad-high')
    expect(repo.createImpression).toHaveBeenCalledWith(expect.objectContaining({ chargeMillicents: 900 }))
  })
})

describe('AdsDeliveryService.ingest', () => {
  const impression = {
    id: 'imp-1',
    userId: USER,
    adId: 'ad-1',
    servedAt: new Date('2026-11-22T11:59:50Z'),
    viewableAt: null,
    clickedAt: null,
    hiddenAt: null,
    ad: { adSetId: 'set-1', adSet: { campaign: { accountId: 'acc-1', account: { companyId: 'co-1' } } } },
  }
  const event = (overrides: Record<string, unknown> = {}) => ({
    eventId: '11111111-1111-4111-8111-111111111111',
    type: 'VIEWABLE_IMPRESSION',
    impressionId: 'imp-1',
    adId: 'ad-1',
    surface: 'FEED_FOR_YOU',
    position: 0,
    occurredAt: '2026-11-22T11:59:55Z',
    visibleMs: 1500,
    ...overrides,
  })

  it('aceita exibição visível válida', async () => {
    const repo = makeRepo()
    repo.findImpression.mockResolvedValue(impression)
    const result = await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).ingest(USER, { events: [event()] } as never, NOW)
    expect(result).toEqual({ accepted: 1, duplicates: 0, rejected: 0 })
    expect(repo.applyEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACCEPTED', reason: null, accountId: 'acc-1', companyId: 'co-1', day: '2026-11-22' }))
  })

  it('entrega de outra pessoa, de outro anúncio ou inexistente é ignorada sem aplicar nada', async () => {
    const repo = makeRepo()
    const service = new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never)
    repo.findImpression.mockResolvedValueOnce({ ...impression, userId: 'someone-else' })
    repo.findImpression.mockResolvedValueOnce({ ...impression, adId: 'other-ad' })
    repo.findImpression.mockResolvedValueOnce(null)
    const result = await service.ingest(USER, { events: [event(), event({ eventId: '22222222-2222-4222-8222-222222222222' }), event({ eventId: '33333333-3333-4333-8333-333333333333' })] } as never, NOW)
    expect(result).toEqual({ accepted: 0, duplicates: 0, rejected: 3 })
    expect(repo.applyEvent).not.toHaveBeenCalled()
  })

  it('evento inválido é guardado com o motivo e conta como rejeitado', async () => {
    const repo = makeRepo()
    repo.findImpression.mockResolvedValue(impression)
    const result = await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).ingest(USER, { events: [event({ visibleMs: 300 })] } as never, NOW)
    expect(result.rejected).toBe(1)
    expect(repo.applyEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 'INVALID', reason: 'NOT_VIEWABLE' }))
  })

  it('evento repetido (mesmo eventId) conta como duplicado', async () => {
    const repo = makeRepo()
    repo.findImpression.mockResolvedValue(impression)
    repo.applyEvent.mockResolvedValue(false)
    expect(await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).ingest(USER, { events: [event()] } as never, NOW)).toEqual({ accepted: 0, duplicates: 1, rejected: 0 })
  })

  it('clique consulta os cliques do dia antes de aceitar', async () => {
    const repo = makeRepo()
    repo.findImpression.mockResolvedValue(impression)
    repo.countClicks.mockResolvedValue(2)
    const result = await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).ingest(USER, { events: [event({ type: 'CLICK', visibleMs: undefined })] } as never, NOW)
    expect(result.rejected).toBe(1)
    expect(repo.applyEvent).toHaveBeenCalledWith(expect.objectContaining({ reason: 'TOO_MANY_CLICKS' }))
  })
})

describe('AdsDeliveryService.stats e fechamento', () => {
  it('só a empresa dona da conta vê o relatório', async () => {
    const repo = makeRepo()
    repo.findAccount.mockResolvedValue({ id: 'acc-1', companyId: 'co-1' })
    const service = new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never)
    await expect(service.stats('outra', 'acc-1')).rejects.toBeInstanceOf(NotFoundException)
    repo.listAccountDailyStats.mockResolvedValue([{ day: new Date('2026-11-22'), _sum: { impressions: 10, viewableImpressions: 7, clicks: 1, hides: 0, spendMillicents: 25_400, conversions: 2, conversionValueCents: BigInt(1500) } }])
    expect(await service.stats('co-1', 'acc-1')).toEqual([{ day: '2026-11-22', impressions: 10, viewableImpressions: 7, clicks: 1, hides: 0, spendCents: 25, conversions: 2, conversionValueCents: 1500, messageConversations: 0 }])
  })

  it('totais por anúncio: só a empresa dona vê, e o gasto sai em centavos', async () => {
    const repo = makeRepo()
    repo.findAccount.mockResolvedValue({ id: 'acc-1', companyId: 'co-1' })
    const service = new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never)
    await expect(service.statsByAd('outra', 'acc-1', 7)).rejects.toBeInstanceOf(NotFoundException)
    expect(repo.listAccountAdTotals).not.toHaveBeenCalled()
    repo.listAccountAdTotals.mockResolvedValue([
      { adId: 'ad-1', _sum: { impressions: 10, viewableImpressions: 7, clicks: 1, hides: 0, spendMillicents: 25_400, conversions: 2, conversionValueCents: BigInt(1500), messageConversations: 3 } },
      { adId: 'ad-2', _sum: { impressions: null, viewableImpressions: null, clicks: null, hides: null, spendMillicents: null, conversions: null, conversionValueCents: null, messageConversations: null } },
    ])
    expect(await service.statsByAd('co-1', 'acc-1', 7)).toEqual([
      { adId: 'ad-1', impressions: 10, viewableImpressions: 7, clicks: 1, hides: 0, spendCents: 25, conversions: 2, conversionValueCents: 1500, messageConversations: 3 },
      { adId: 'ad-2', impressions: 0, viewableImpressions: 0, clicks: 0, hides: 0, spendCents: 0, conversions: 0, conversionValueCents: 0, messageConversations: 0 },
    ])
    expect(repo.listAccountAdTotals).toHaveBeenCalledWith('acc-1', expect.any(Date))
  })

  it('o fechamento horário passa por cada conta com gasto a lançar e não derruba o resto se uma falhar', async () => {
    const repo = makeRepo()
    repo.accountsWithPendingSpend.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    repo.closeSpend.mockResolvedValue(undefined)
    expect(await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).closeSpend()).toBe(2)
    repo.closeSpend.mockRejectedValueOnce(new Error('falhou'))
    expect(await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).closeSpend()).toBe(1)
  })
})

describe('AdsDeliveryService.next: carrossel', () => {
  const photo = (id: string, status = 'READY') => ({
    id, kind: 'IMAGE', status, format: 'SQUARE', key: `posts/${id}.jpg`, feedKey: `posts/${id}.feed.jpg`, thumbKey: `posts/${id}.thumb.webp`,
    posterKey: null, width: 1080, height: 1080, sourceWidth: 2000, sourceHeight: 2000, durationMs: null, legacy: false,
  })
  const carousel = (...media: unknown[]) => candidate({ creative: { headline: 'Pão', body: 'Quente', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.example/', media } })

  it('entrega todas as fotos, na ordem, e `media` é a primeira (para os apps antigos)', async () => {
    const view = await new AdsDeliveryService(makeRepo([carousel(photo('a'), photo('b'), photo('c'))]) as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)
    expect(view?.mediaItems.map((item) => item.url)).toEqual(['https://cdn.test/posts/a.feed.jpg', 'https://cdn.test/posts/b.feed.jpg', 'https://cdn.test/posts/c.feed.jpg'])
    expect(view?.media).toEqual(view?.mediaItems[0])
  })

  it('basta uma foto não estar pronta para o anúncio não ser entregue', async () => {
    const repo = makeRepo([carousel(photo('a'), photo('b', 'PROCESSING'))])
    expect(await new AdsDeliveryService(repo as never, storage as never, links as never, noAdjacency() as never).next(USER, query, NOW)).toBeNull()
    expect(repo.createImpression).not.toHaveBeenCalled()
  })
})
