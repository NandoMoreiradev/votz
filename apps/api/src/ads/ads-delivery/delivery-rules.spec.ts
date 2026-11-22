import {
  isHoldout,
  matchesTargeting,
  meetsFloor,
  normalizePlace,
  runAuction,
  saoPauloDay,
  splitSpend,
  validateEvent,
  type AdSetTargeting,
  type Viewer,
} from './delivery-rules'

const open: AdSetTargeting = { states: [], cities: [], interests: [], ageBands: [], genders: [], automaticAudience: false }
const anonymous: Viewer = { state: 'SP', city: 'São Paulo', personalization: false, interests: [], ageBand: null, gender: null }
const consented: Viewer = { state: 'SP', city: 'São Paulo', personalization: true, interests: ['food-drink'], ageBand: '25-34', gender: 'FEMALE' }

describe('matchesTargeting', () => {
  it('sem alvo, aparece para todo mundo', () => {
    expect(matchesTargeting(open, anonymous)).toBe(true)
  })

  it('região: estado e cidade (sem depender de acento ou maiúscula)', () => {
    expect(matchesTargeting({ ...open, states: ['sp'] }, anonymous)).toBe(true)
    expect(matchesTargeting({ ...open, states: ['RJ'] }, anonymous)).toBe(false)
    expect(matchesTargeting({ ...open, cities: ['sao paulo'] }, anonymous)).toBe(true)
    expect(matchesTargeting({ ...open, cities: ['Campinas'] }, anonymous)).toBe(false)
  })

  it('sem região conhecida, conjunto com região não aparece', () => {
    expect(matchesTargeting({ ...open, states: ['SP'] }, { ...anonymous, state: null })).toBe(false)
    expect(matchesTargeting({ ...open, cities: ['Campinas'] }, { ...anonymous, city: null })).toBe(false)
  })

  it('interesse, faixa e gênero exigem aceite de personalização', () => {
    expect(matchesTargeting({ ...open, interests: ['food-drink'] }, anonymous)).toBe(false)
    expect(matchesTargeting({ ...open, ageBands: ['25-34'] }, anonymous)).toBe(false)
    expect(matchesTargeting({ ...open, genders: ['FEMALE'] }, anonymous)).toBe(false)
    expect(matchesTargeting({ ...open, interests: ['food-drink'], ageBands: ['25-34'], genders: ['FEMALE'] }, consented)).toBe(true)
  })

  it('com aceite, qualquer critério que não bate derruba', () => {
    expect(matchesTargeting({ ...open, interests: ['sports'] }, consented)).toBe(false)
    expect(matchesTargeting({ ...open, ageBands: ['45-54'] }, consented)).toBe(false)
    expect(matchesTargeting({ ...open, genders: ['MALE'] }, consented)).toBe(false)
    expect(matchesTargeting({ ...open, ageBands: ['25-34'] }, { ...consented, ageBand: null })).toBe(false)
  })

  it('público automático só olha a região', () => {
    const automatic = { ...open, automaticAudience: true, interests: ['sports'], ageBands: ['45-54'], states: ['SP'] }
    expect(matchesTargeting(automatic, anonymous)).toBe(true)
    expect(matchesTargeting({ ...automatic, states: ['RJ'] }, anonymous)).toBe(false)
  })
})

describe('isHoldout', () => {
  it('é estável para a mesma pessoa e respeita a fração', () => {
    expect(isHoldout('abc', 0.05)).toBe(isHoldout('abc', 0.05))
    expect(isHoldout('abc', 0)).toBe(false)
    expect(isHoldout('abc', 1)).toBe(true)
    const ids = Array.from({ length: 4000 }, (_, index) => `user-${index}-${(index * 7919).toString(16)}`)
    const share = ids.filter((id) => isHoldout(id, 0.05)).length / ids.length
    expect(share).toBeGreaterThan(0.03)
    expect(share).toBeLessThan(0.07)
  })
})

describe('datas e lugares', () => {
  it('o dia vale no fuso de São Paulo', () => {
    // 02:30 UTC ainda é a noite anterior em São Paulo (UTC-3).
    expect(saoPauloDay(new Date('2026-11-22T02:30:00Z'))).toBe('2026-11-21')
    expect(saoPauloDay(new Date('2026-11-22T12:00:00Z'))).toBe('2026-11-22')
  })

  it('normaliza acento e caixa', () => {
    expect(normalizePlace('  São José  ')).toBe('sao jose')
    expect(normalizePlace(null)).toBe('')
  })
})

describe('runAuction', () => {
  const cpm = (adId: string, bid: number | null) => ({ adId, objective: 'AWARENESS' as const, bidCapCents: bid })
  const cpc = (adId: string, bid: number | null) => ({ adId, objective: 'TRAFFIC' as const, bidCapCents: bid })

  it('sem concorrente, paga o piso', () => {
    expect(runAuction([cpm('a', 2000)], () => 0)).toMatchObject({ winner: { adId: 'a' }, priceCents: 600 })
    expect(runAuction([cpc('a', 500)], () => 0)).toMatchObject({ priceCents: 40 })
  })

  it('segundo preço: vence o maior lance e paga o que bastava', () => {
    const result = runAuction([cpm('a', 2000), cpm('b', 900), cpm('c', 700)], () => 0)
    expect(result?.winner.adId).toBe('a')
    expect(result?.priceCents).toBe(900)
  })

  it('nunca paga mais que o próprio lance', () => {
    const result = runAuction([cpm('a', 1000), cpm('b', 1000)], () => 0)
    expect(result?.priceCents).toBe(1000)
  })

  it('lance abaixo do piso não entra; sem lance, vale o piso', () => {
    expect(meetsFloor(cpm('a', 599))).toBe(false)
    expect(runAuction([cpm('a', 599)], () => 0)).toBeNull()
    expect(runAuction([cpm('a', null), cpm('b', 599)], () => 0)?.winner.adId).toBe('a')
  })

  it('compara clique com mil exibições pelo valor esperado', () => {
    // R$ 1,00 por clique com 1% de chance vale R$ 10,00 por mil, mais que R$ 8,00 por mil.
    const result = runAuction([cpm('a', 800), cpc('b', 100)], () => 0)
    expect(result?.winner.adId).toBe('b')
    // Paga em centavos de clique: o que bastava para passar R$ 8,00 por mil (80 centavos por clique).
    expect(result?.priceCents).toBe(80)
  })

  it('empate sai por sorteio', () => {
    let calls = 0
    const random = () => (calls++ === 0 ? 0.9 : 0.1)
    expect(runAuction([cpm('a', 800), cpm('b', 800)], random)?.winner.adId).toBe('b')
  })

  it('lista vazia não tem vencedor', () => {
    expect(runAuction([])).toBeNull()
  })
})

describe('validateEvent', () => {
  const now = new Date('2026-11-22T12:00:00Z')
  const served = new Date('2026-11-22T11:59:50Z')
  const fresh = { servedAt: served, viewableAt: null, clickedAt: null, hiddenAt: null }
  const at = (iso: string) => new Date(iso)

  it('exibição visível precisa de 1 segundo', () => {
    expect(validateEvent({ type: 'VIEWABLE_IMPRESSION', occurredAt: at('2026-11-22T11:59:55Z'), visibleMs: 1200 }, fresh, now, 0)).toBeNull()
    expect(validateEvent({ type: 'VIEWABLE_IMPRESSION', occurredAt: at('2026-11-22T11:59:55Z'), visibleMs: 400 }, fresh, now, 0)).toBe('NOT_VIEWABLE')
    expect(validateEvent({ type: 'VIEWABLE_IMPRESSION', occurredAt: at('2026-11-22T11:59:55Z') }, fresh, now, 0)).toBe('NOT_VIEWABLE')
  })

  it('não dá para ficar visível mais tempo do que passou desde a entrega', () => {
    expect(validateEvent({ type: 'VIEWABLE_IMPRESSION', occurredAt: at('2026-11-22T11:59:55Z'), visibleMs: 3_000_000 }, fresh, now, 0)).toBe('CLOCK_SKEW')
  })

  it('clique rápido demais é de robô', () => {
    const justServed = { ...fresh, servedAt: new Date(now.getTime() - 100) }
    expect(validateEvent({ type: 'CLICK', occurredAt: now }, justServed, now, 0)).toBe('CLICK_TOO_FAST')
    expect(validateEvent({ type: 'CLICK', occurredAt: now }, fresh, now, 0)).toBeNull()
  })

  it('limita cliques da mesma pessoa no mesmo anúncio', () => {
    expect(validateEvent({ type: 'CLICK', occurredAt: now }, fresh, now, 1)).toBeNull()
    expect(validateEvent({ type: 'CLICK', occurredAt: now }, fresh, now, 2)).toBe('TOO_MANY_CLICKS')
  })

  it('exibição vencida e relógio fora de hora', () => {
    const old = { ...fresh, servedAt: new Date('2026-11-20T11:00:00Z') }
    expect(validateEvent({ type: 'CLICK', occurredAt: now }, old, now, 0)).toBe('IMPRESSION_EXPIRED')
    expect(validateEvent({ type: 'CLICK', occurredAt: at('2026-11-22T13:00:00Z') }, fresh, now, 0)).toBe('CLOCK_SKEW')
    expect(validateEvent({ type: 'CLICK', occurredAt: at('2026-11-22T10:00:00Z') }, fresh, now, 0)).toBe('CLOCK_SKEW')
  })

  it('repetir a mesma ação não conta de novo, mas esconder a empresa vale depois de esconder o anúncio', () => {
    expect(validateEvent({ type: 'VIEWABLE_IMPRESSION', occurredAt: now, visibleMs: 2000 }, { ...fresh, viewableAt: now }, now, 0)).toBe('DUPLICATE_ACTION')
    expect(validateEvent({ type: 'CLICK', occurredAt: now }, { ...fresh, clickedAt: now }, now, 0)).toBe('DUPLICATE_ACTION')
    expect(validateEvent({ type: 'HIDE', occurredAt: now }, { ...fresh, hiddenAt: now }, now, 0)).toBe('DUPLICATE_ACTION')
    expect(validateEvent({ type: 'HIDE_ADVERTISER', occurredAt: now }, { ...fresh, hiddenAt: now }, now, 0)).toBeNull()
  })
})

describe('splitSpend', () => {
  it('separa centavos inteiros do que sobra', () => {
    expect(splitSpend(2599)).toEqual({ cents: 2, remainderMillicents: 599 })
    expect(splitSpend(999)).toEqual({ cents: 0, remainderMillicents: 999 })
    expect(splitSpend(100_000)).toEqual({ cents: 100, remainderMillicents: 0 })
  })
})
