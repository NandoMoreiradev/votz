import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { PRESS_PLAN_LIMITS } from '@votz/shared-types'
import { DEFAULT_SEARCH_MIN_SCORE, PressSearchService, makeExcerpt } from './press-search.service'

const access = { require: jest.fn() }
const embedding = { embed: jest.fn() }
const repo = { searchByEmbedding: jest.fn(), countMissingEmbeddings: jest.fn() }
const config = { get: jest.fn() }

const free = { plan: 'GRATUITA', limits: PRESS_PLAN_LIMITS.GRATUITA }
const pro = { plan: 'PRO', limits: PRESS_PLAN_LIMITS.PRO }
const vec = Array.from({ length: 768 }, (_, i) => i / 1000)

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1', title: 'Falta de remédio', description: 'O posto está   sem\n dipirona.', category: 'HEALTH', status: 'OPEN',
  city: 'Campinas', state: 'SP', pressureScore: 51.234, createdAt: new Date('2026-11-20T10:00:00Z'), pressContactOk: true, score: 0.8249, ...over,
})

describe('PressSearchService', () => {
  let service: PressSearchService

  beforeEach(() => {
    jest.clearAllMocks()
    access.require.mockResolvedValue(free)
    embedding.embed.mockResolvedValue(vec)
    repo.searchByEmbedding.mockResolvedValue([row()])
    repo.countMissingEmbeddings.mockResolvedValue(12)
    config.get.mockReturnValue(undefined)
    service = new PressSearchService(access as any, embedding as any, repo as any, config as any)
  })

  it('quem não é imprensa verificada não busca', async () => {
    access.require.mockRejectedValueOnce(new ForbiddenException('x'))
    await expect(service.search('u1', { q: 'falta de remédio' })).rejects.toThrow(ForbiddenException)
    expect(embedding.embed).not.toHaveBeenCalled()
  })

  it('valida o texto, o estado e o tema antes de gastar uma chamada à IA', async () => {
    await expect(service.search('u1', { q: '  a ' })).rejects.toThrow(BadRequestException)
    await expect(service.search('u1', { q: 'x'.repeat(301) })).rejects.toThrow(BadRequestException)
    await expect(service.search('u1', { q: 'remédio', state: 'SÃO' })).rejects.toThrow(BadRequestException)
    await expect(service.search('u1', { q: 'remédio', category: 'NADA' })).rejects.toThrow(BadRequestException)
    expect(embedding.embed).not.toHaveBeenCalled()
  })

  it('busca com o texto como "consulta", filtros e limite do plano gratuito (10 resultados, 90 dias)', async () => {
    await service.search('u1', { q: ' falta   de remédio ', state: 'sp', city: ' São Paulo ', category: 'HEALTH', days: 365 })
    expect(embedding.embed).toHaveBeenCalledWith('falta de remédio', 'query')
    const filters = repo.searchByEmbedding.mock.calls[0][1]
    expect(filters).toMatchObject({
      limit: 10, minScore: DEFAULT_SEARCH_MIN_SCORE, state: 'SP', cityKey: 'sao paulo', cityLower: 'são paulo', category: 'HEALTH',
    })
    const days = Math.round((Date.now() - filters.since.getTime()) / 86_400_000)
    expect(days).toBe(90)
  })

  it('Pro: 30 resultados e até 365 dias', async () => {
    access.require.mockResolvedValue(pro)
    await service.search('u1', { q: 'falta de remédio' })
    const filters = repo.searchByEmbedding.mock.calls[0][1]
    expect(filters.limit).toBe(30)
    expect(Math.round((Date.now() - filters.since.getTime()) / 86_400_000)).toBe(365)
  })

  it('devolve resultados limpos: trecho curto, nota de 0 a 100, pressão arredondada e aviso de indexação', async () => {
    const res = await service.search('u1', { q: 'falta de remédio' })
    expect(res).toEqual({
      query: 'falta de remédio',
      total: 1,
      results: [{
        id: 'r1', title: 'Falta de remédio', excerpt: 'O posto está sem dipirona.', category: 'HEALTH', status: 'OPEN',
        city: 'Campinas', state: 'SP', pressureScore: 51.23, createdAt: '2026-11-20T10:00:00.000Z', pressContactOk: true, score: 82,
      }],
      indexing: { missing: 12 },
    })
  })

  it('a mesma busca repetida não gasta outra chamada à IA', async () => {
    await service.search('u1', { q: 'Falta de remédio' })
    await service.search('u2', { q: 'falta de remédio' })
    expect(embedding.embed).toHaveBeenCalledTimes(1)
    expect(repo.countMissingEmbeddings).toHaveBeenCalledTimes(1)
  })

  it('IA fora do ar vira 503 em português (e não 500)', async () => {
    embedding.embed.mockRejectedValueOnce(new Error('404 model not found'))
    await expect(service.search('u1', { q: 'falta de remédio' })).rejects.toThrow(ServiceUnavailableException)
    await expect(service.search('u1', { q: 'falta de remédio' })).resolves.toBeDefined() // erro não fica guardado
  })

  it('o corte de similaridade pode ser ajustado por PRESS_SEARCH_MIN_SCORE (e valor ruim é ignorado)', async () => {
    config.get.mockReturnValue('0.75')
    await service.search('u1', { q: 'busca um' })
    expect(repo.searchByEmbedding.mock.calls[0][1].minScore).toBe(0.75)
    config.get.mockReturnValue('abc')
    await service.search('u1', { q: 'busca dois' })
    expect(repo.searchByEmbedding.mock.calls[1][1].minScore).toBe(DEFAULT_SEARCH_MIN_SCORE)
  })
})

describe('makeExcerpt', () => {
  it('junta espaços e corta com reticências', () => {
    expect(makeExcerpt('a  b\nc')).toBe('a b c')
    const out = makeExcerpt('palavra '.repeat(100), 50)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.endsWith('…')).toBe(true)
  })
})
