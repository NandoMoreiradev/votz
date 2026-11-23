import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PRESS_PLAN_LIMITS } from '@votz/shared-types'
import { ImprensaService } from './imprensa.service'
import { ImprensaRepository } from './imprensa.repository'
import { PressAccessService } from './press-access.service'
import { csvText, filenamePart } from './csv'
import { TtlCache } from './ttl-cache'

const mockRepo = {
  getResumo: jest.fn(),
  getTendencias: jest.fn(),
  getRelatosDestaque: jest.fn(),
  getEntidadesRanking: jest.fn(),
  getSurtosAtivos: jest.fn(),
  getReportsForExport: jest.fn(),
  getReportsForSeries: jest.fn(),
}

const mockAccess = { require: jest.fn() }
const free = { plan: 'GRATUITA', limits: PRESS_PLAN_LIMITS.GRATUITA, credentialId: 'c1', stripeCustomerId: null, stripeSubscriptionId: null }
const pro = { ...free, plan: 'PRO', limits: PRESS_PLAN_LIMITS.PRO }

const baseReport = {
  id: 'r1',
  title: 'Buraco "enorme"',
  category: 'MOBILITY',
  status: 'OPEN',
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Centro',
  pressureScore: 12.5,
  _count: { votes: 4, comments: 1 },
  createdAt: new Date('2026-10-01T12:00:00Z'),
  firstResponseAt: null,
  resolvedAt: null,
  slaState: null,
  recipientType: null,
}

describe('ImprensaService', () => {
  let service: ImprensaService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImprensaService,
        { provide: ImprensaRepository, useValue: mockRepo },
        { provide: PressAccessService, useValue: mockAccess },
        { provide: ConfigService, useValue: { get: (_k: string, d: string) => d } },
      ],
    }).compile()

    service = module.get(ImprensaService)
    jest.clearAllMocks()
    mockAccess.require.mockResolvedValue(free)
  })

  it('clamps tendencias days between 7 and 365', async () => {
    mockRepo.getTendencias.mockResolvedValue({})
    await service.getTendencias(2)
    expect(mockRepo.getTendencias).toHaveBeenCalledWith(7)

    await service.getTendencias(999)
    expect(mockRepo.getTendencias).toHaveBeenCalledWith(365)
  })

  it('limita limit entre 1 e 50 (negativo ou zero não vira "do fim para o começo")', async () => {
    mockRepo.getRelatosDestaque.mockResolvedValue([])
    await service.getRelatosDestaque(-5)
    expect(mockRepo.getRelatosDestaque).toHaveBeenLastCalledWith(1)
    await service.getRelatosDestaque(500)
    expect(mockRepo.getRelatosDestaque).toHaveBeenLastCalledWith(50)
  })

  it('usa cache: duas leituras seguidas fazem uma consulta só', async () => {
    mockRepo.getResumo.mockResolvedValue({ totalReports: 3 })
    await service.getResumo()
    await service.getResumo()
    expect(mockRepo.getResumo).toHaveBeenCalledTimes(1)
  })

  it('quem não é imprensa verificada não exporta (o acesso recusa)', async () => {
    mockAccess.require.mockRejectedValue(new ForbiddenException('nope'))
    await expect(service.exportCsv('u1')).rejects.toThrow(ForbiddenException)
    await expect(service.exportJson('u1')).rejects.toThrow(ForbiddenException)
    await expect(service.exportSerie('u1')).rejects.toThrow(ForbiddenException)
    expect(mockRepo.getReportsForExport).not.toHaveBeenCalled()
  })

  it('rejeita estado e categoria inválidos com 400 (antes virava erro 500 no banco)', async () => {
    await expect(service.exportCsv('u1', 30, 'SÃO')).rejects.toThrow(BadRequestException)
    await expect(service.exportCsv('u1', 30, 'SP', undefined, 'NAO_EXISTE')).rejects.toThrow(BadRequestException)
    expect(mockRepo.getReportsForExport).not.toHaveBeenCalled()
  })

  it('exports escaped CSV with BOM, link and safe filename', async () => {
    mockRepo.getReportsForExport.mockResolvedValue([baseReport])

    const res = await service.exportCsv('u1', 30, 'SP', 'São Paulo')
    expect(res.filename).toMatch(/-sp-sao-paulo\.csv$/)
    expect(res.csv.startsWith('﻿id,link,titulo')).toBe(true)
    expect(res.csv).toContain('"Buraco ""enorme"""')
    expect(res.csv).toContain('"http://localhost:5173/relatos/r1"')
    expect(res.csv).toContain('12.50')
  })

  it('plano gratuito: pede só 1000 linhas, sem coluna de descrição, e não passa de 90 dias', async () => {
    mockRepo.getReportsForExport.mockResolvedValue([baseReport])
    const res = await service.exportCsv('u1', 90)
    expect(mockRepo.getReportsForExport).toHaveBeenCalledWith(90, undefined, undefined, undefined, 1000, false)
    expect(res.csv.split('\r\n')[0]).not.toContain('descricao')

    await expect(service.exportCsv('u1', 91)).rejects.toThrow(ForbiddenException)
    await expect(service.exportCsv('u1', 365)).rejects.toThrow(/90 dias/)
  })

  it('plano Pro: 365 dias, 5000 linhas e colunas descricao e destinatario_tipo', async () => {
    mockAccess.require.mockResolvedValue(pro)
    mockRepo.getReportsForExport.mockResolvedValue([{ ...baseReport, description: 'Rua "esburacada", sem luz', recipientType: 'ENTITY' }])
    const res = await service.exportCsv('u1', 365)
    expect(mockRepo.getReportsForExport).toHaveBeenCalledWith(365, undefined, undefined, undefined, 5000, true)
    const [header, row] = res.csv.replace('﻿', '').split('\r\n')
    expect(header.endsWith('descricao,destinatario_tipo')).toBe(true)
    expect(row.endsWith('"Rua ""esburacada"", sem luz","ENTITY"')).toBe(true)
  })

  it('JSON e série são só do plano Pro', async () => {
    await expect(service.exportJson('u1')).rejects.toThrow(/Imprensa Pro/)
    await expect(service.exportSerie('u1')).rejects.toThrow(/Imprensa Pro/)
    expect(mockRepo.getReportsForSeries).not.toHaveBeenCalled()
  })

  it('JSON do Pro traz filtros, total e relatos com descrição', async () => {
    mockAccess.require.mockResolvedValue(pro)
    mockRepo.getReportsForExport.mockResolvedValue([{ ...baseReport, description: 'texto' }])
    const { json, filename } = await service.exportJson('u1', 30, 'sp', 'São Paulo')
    const parsed = JSON.parse(json)
    expect(filename).toMatch(/^votz-relatos-.*-sp-sao-paulo\.json$/)
    expect(parsed.total).toBe(1)
    expect(parsed.filtros).toMatchObject({ dias: 30, estado: 'SP', cidade: 'São Paulo' })
    expect(parsed.relatos[0]).toMatchObject({ id: 'r1', descricao: 'texto', pressao: 12.5, apoios: 4, link: 'http://localhost:5173/relatos/r1' })
  })

  it('série do Pro: semana ou mês, com cabeçalho e nome de arquivo', async () => {
    mockAccess.require.mockResolvedValue(pro)
    mockRepo.getReportsForSeries.mockResolvedValue([])
    const res = await service.exportSerie('u1', 30, 'month')
    expect(res.csv.replace('﻿', '').split('\r\n')[0]).toBe('periodo,relatos,respondidos,resolvidos,pressao_media')
    expect(res.filename).toMatch(/-mensal\.csv$/)
    await expect(service.exportSerie('u1', 30, 'ano')).rejects.toThrow(BadRequestException)
  })

  it('neutraliza fórmula do Excel e vírgula no bairro (texto livre do cidadão)', async () => {
    mockRepo.getReportsForExport.mockResolvedValue([
      { ...baseReport, title: '=HYPERLINK("http://x.test","clique")', neighborhood: 'Centro, Zona Sul\nbloco 2' },
    ])

    const { csv } = await service.exportCsv('u1')
    expect(csv).toContain(`"'=HYPERLINK(""http://x.test"",""clique"")"`)
    expect(csv).toContain('"Centro, Zona Sul bloco 2"')
    // cada relato é uma linha só: cabeçalho + 1 relato + linha final vazia
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('o nome do arquivo não carrega aspas nem quebra de linha da cidade digitada', async () => {
    mockRepo.getReportsForExport.mockResolvedValue([])
    const { filename } = await service.exportCsv('u1', 30, undefined, 'X"\r\nSet-Cookie: a=b')
    expect(filename).toMatch(/^votz-relatos-\d{4}-\d{2}-\d{2}-x-set-cookie-a-b\.csv$/)
  })
})

describe('csv helpers', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd'])('prefixa %j com apóstrofo', (v) => {
    expect(csvText(v).startsWith(`"'`)).toBe(true)
  })

  it('não mexe em texto comum e trata vazio', () => {
    expect(csvText('Rua das Flores')).toBe('"Rua das Flores"')
    expect(csvText(null)).toBe('""')
    expect(csvText(undefined)).toBe('""')
  })

  it('filenamePart tira acento e limita o tamanho', () => {
    expect(filenamePart('São José dos Pinhais')).toBe('sao-jose-dos-pinhais')
    expect(filenamePart('a'.repeat(100))).toHaveLength(40)
    expect(filenamePart(undefined)).toBe('')
  })
})

describe('TtlCache', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('expira depois da validade e recarrega', async () => {
    const cache = new TtlCache()
    const load = jest.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b')
    expect(await cache.get('k', 1000, load)).toBe('a')
    expect(await cache.get('k', 1000, load)).toBe('a')
    jest.advanceTimersByTime(1001)
    expect(await cache.get('k', 1000, load)).toBe('b')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('pedidos simultâneos dividem a mesma consulta', async () => {
    const cache = new TtlCache()
    let resolve!: (v: string) => void
    const load = jest.fn(() => new Promise<string>((r) => { resolve = r }))
    const a = cache.get('k', 1000, load)
    const b = cache.get('k', 1000, load)
    resolve('x')
    expect(await Promise.all([a, b])).toEqual(['x', 'x'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('erro na consulta não fica guardado', async () => {
    const cache = new TtlCache()
    const load = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok')
    await expect(cache.get('k', 1000, load)).rejects.toThrow('boom')
    expect(await cache.get('k', 1000, load)).toBe('ok')
  })
})
