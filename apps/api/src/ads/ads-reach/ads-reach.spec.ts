import { AD_REACH, describeAdReach, type AdReachEstimateInput } from '@votz/shared-types'
import { AdsReachService } from './ads-reach.service'
import { ageBandBirthRange, buildAudienceWhere, matchCities, withoutHoldout } from './reach-rules'

const TODAY = new Date('2026-11-23T12:00:00Z')
const input = (over: Partial<AdReachEstimateInput> = {}): AdReachEstimateInput => ({ states: [], cities: [], interests: [], ageBands: [], genders: [], automaticAudience: false, ...over })

describe('describeAdReach', () => {
  it('abaixo do mínimo não diz número', () => {
    const estimate = describeAdReach(AD_REACH.MIN_AUDIENCE - 1, false)
    expect(estimate).toMatchObject({ kind: 'FEW', min: null, max: null })
    expect(estimate.label).toMatch(/Poucas pessoas/)
  })

  it('diz a faixa em que o total cai, nunca o número exato', () => {
    expect(describeAdReach(100, false)).toMatchObject({ kind: 'RANGE', min: 100, max: 500, label: 'Entre 100 e 500 pessoas' })
    expect(describeAdReach(4_999, false)).toMatchObject({ min: 1_000, max: 5_000 })
    expect(describeAdReach(5_000, false)).toMatchObject({ min: 5_000, max: 10_000 })
    expect(describeAdReach(73_412, false).label).toBe('Entre 50.000 e 100.000 pessoas')
  })

  it('o topo da escala vira "mais de"', () => {
    expect(describeAdReach(9_000_000, false)).toMatchObject({ min: 5_000_000, max: null, label: 'Mais de 5.000.000 pessoas' })
  })

  it('público personalizado avisa que só entra quem ligou os anúncios personalizados', () => {
    expect(describeAdReach(1_000, true).note).toMatch(/ligaram os anúncios personalizados/)
    expect(describeAdReach(1_000, false).note).not.toMatch(/ligaram os anúncios personalizados/)
  })
})

describe('regras do alcance', () => {
  it('faixa de idade vira intervalo de nascimento (quem faz 25 hoje já está na faixa 25-34)', () => {
    const range = ageBandBirthRange('25-34', TODAY)
    expect(range.lte.toISOString().slice(0, 10)).toBe('2001-11-23')
    expect(range.gt.toISOString().slice(0, 10)).toBe('1991-11-23')
  })

  it('sem personalização pedida, só região e maioridade (sem exigir aceite)', () => {
    const where = buildAudienceWhere(input({ states: ['sp'] }), TODAY)
    expect(where).toMatchObject({ banned: false, type: 'CITIZEN', state: { in: ['SP'] } })
    expect(JSON.stringify(where)).not.toContain('personalizationConsent')
    expect(where.AND).toHaveLength(1) // só a regra de maioridade
  })

  it('interesse, idade ou gênero exigem aceite de personalização', () => {
    const where = buildAudienceWhere(input({ interests: ['food-drink'], ageBands: ['25-34'], genders: ['FEMALE'] }), TODAY)
    const text = JSON.stringify(where)
    expect(text).toContain('"personalizationConsent":true')
    expect(text).toContain('"hasSome":["food-drink"]')
    expect(text).toContain('"gender":{"in":["FEMALE"]}')
  })

  it('público automático ignora interesse, idade e gênero (só a região conta)', () => {
    const where = buildAudienceWhere(input({ automaticAudience: true, interests: ['food-drink'], ageBands: ['25-34'] }), TODAY)
    expect(JSON.stringify(where)).not.toContain('personalizationConsent')
  })

  it('compara cidades sem acento e sem maiúscula e soma só as pedidas', () => {
    const rows = [{ city: 'São Paulo', count: 10 }, { city: 'SAO PAULO', count: 5 }, { city: 'Campinas', count: 7 }, { city: null, count: 3 }]
    expect(matchCities(rows, ['sao paulo'])).toBe(15)
    expect(matchCities(rows, ['Santos'])).toBe(0)
  })

  it('tira o grupo de controle de 5%', () => {
    expect(withoutHoldout(1_000)).toBe(950)
  })
})

describe('AdsReachService', () => {
  const repo = { count: jest.fn(), countByCity: jest.fn() }
  const service = () => new AdsReachService(repo as never)
  beforeEach(() => jest.resetAllMocks())

  it('sem cidade conta direto e devolve a faixa', async () => {
    repo.count.mockResolvedValue(2_000)
    const estimate = await service().estimate(input({ states: ['SP'] }), TODAY)
    expect(estimate).toMatchObject({ kind: 'RANGE', min: 1_000, max: 5_000 })
    expect(repo.countByCity).not.toHaveBeenCalled()
  })

  it('com cidade, soma pelas cidades pedidas', async () => {
    repo.countByCity.mockResolvedValue([{ city: 'Campinas', count: 600 }, { city: 'Santos', count: 90_000 }])
    const estimate = await service().estimate(input({ cities: ['campinas'] }), TODAY)
    expect(estimate).toMatchObject({ min: 500, max: 1_000 }) // 600 menos 5% de controle = 570
  })

  it('público pequeno não vira número', async () => {
    repo.count.mockResolvedValue(40)
    expect((await service().estimate(input({ states: ['AC'] }), TODAY)).kind).toBe('FEW')
  })

  it('o mesmo público, na mesma ordem ou não, vai ao banco uma vez por minuto', async () => {
    repo.count.mockResolvedValue(2_000)
    const svc = service()
    await svc.estimate(input({ states: ['SP', 'RJ'] }), TODAY)
    await svc.estimate(input({ states: ['rj', 'sp'] }), new Date(TODAY.getTime() + 30_000))
    expect(repo.count).toHaveBeenCalledTimes(1)
    await svc.estimate(input({ states: ['SP', 'RJ'] }), new Date(TODAY.getTime() + 61_000))
    expect(repo.count).toHaveBeenCalledTimes(2)
  })
})
