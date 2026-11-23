import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { PRESS_PLAN_LIMITS } from '@votz/shared-types'
import { PressBriefingService } from './press-briefing.service'

const access = { require: jest.fn() }
const repo = {
  findSurto: jest.fn(), latestBriefing: jest.fn(), loadReports: jest.fn(), countReports: jest.fn(),
  entityNames: jest.fn(), saveBriefing: jest.fn(),
}
const analyzer = { available: true, model: 'gemini-test', generate: jest.fn() }

const pro = { plan: 'PRO', limits: PRESS_PLAN_LIMITS.PRO }
const free = { plan: 'GRATUITA', limits: PRESS_PLAN_LIMITS.GRATUITA }
const surto = { id: 'surto12345', category: 'HEALTH', city: 'Campinas', state: 'SP' }

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1', title: 'Sem remédio no posto', description: 'O posto está sem dipirona. Ligue (19) 99876-5432', anonymous: false,
  status: 'OPEN', neighborhood: 'Centro', pressureScore: 50, createdAt: new Date('2026-11-22T10:00:00Z'),
  firstResponseAt: null, recipientType: 'ENTITY', recipientId: 'e1', city: 'Campinas', state: 'SP', ...over,
})

const goodAi = JSON.stringify({
  headline: 'Moradores relatam falta de remédio',
  summary: 'Vários moradores dizem que o posto está sem medicamento.',
  complaints: [{ title: 'Falta de remédio', detail: 'O posto não tem remédio básico.', refs: [1] }],
  questions: ['Quando o estoque volta?'],
  caveats: ['São relatos de moradores.'],
})

describe('PressBriefingService', () => {
  let service: PressBriefingService

  beforeEach(() => {
    jest.clearAllMocks()
    access.require.mockResolvedValue(pro)
    analyzer.available = true
    repo.findSurto.mockResolvedValue(surto)
    repo.latestBriefing.mockResolvedValue(null)
    repo.loadReports.mockResolvedValue([row(), row({ id: 'r2', anonymous: true, title: 'Anônimo' })])
    repo.countReports.mockResolvedValue(2)
    repo.entityNames.mockResolvedValue(new Map([['e1', 'Secretaria de Saúde']]))
    repo.saveBriefing.mockImplementation(async (d: any) => ({ ...d, generatedAt: new Date('2026-11-23T12:00:00Z') }))
    analyzer.generate.mockResolvedValue(goodAi)
    service = new PressBriefingService(access as any, repo as any, analyzer as any)
  })

  it('é só do plano Pro e exige que o surto exista', async () => {
    access.require.mockResolvedValueOnce(free)
    await expect(service.get('u1', 'surto12345')).rejects.toThrow(ForbiddenException)
    expect(repo.findSurto).not.toHaveBeenCalled()

    repo.findSurto.mockResolvedValueOnce(null)
    await expect(service.get('u1', 'surto12345')).rejects.toThrow(NotFoundException)
  })

  it('gera com IA: números do banco, texto da IA, só relatos públicos como fonte', async () => {
    const res = await service.get('u1', 'surto12345')

    expect(res.aiGenerated).toBe(true)
    expect(res.content?.headline).toBe('Moradores relatam falta de remédio')
    expect(res.stats).toMatchObject({ totalReports: 2, publicReports: 1, topEntities: [{ name: 'Secretaria de Saúde', count: 2 }] })
    expect(res.references).toEqual([{ n: 1, id: 'r1', title: 'Sem remédio no posto', city: 'Campinas', state: 'SP' }])
    expect(res.disclaimer).toMatch(/inteligência artificial/)
    expect(repo.saveBriefing).toHaveBeenCalledWith(expect.objectContaining({ aiGenerated: true, model: 'gemini-test' }))
  })

  it('para a IA vai só o relato público, e sem telefone', async () => {
    await service.get('u1', 'surto12345')
    const prompt = analyzer.generate.mock.calls[0][0] as string
    expect(prompt).toContain('Sem remédio no posto')
    expect(prompt).not.toContain('Anônimo')
    expect(prompt).not.toContain('99876-5432')
    expect(prompt).toContain('[telefone]')
  })

  it('reaproveita o briefing recente em vez de chamar a IA de novo (custo por surto, não por pessoa)', async () => {
    repo.latestBriefing.mockResolvedValue({
      surtoId: 'surto12345', aiGenerated: true, generatedAt: new Date(), content: JSON.parse(goodAi), stats: { totalReports: 2 }, references: [],
    })
    const res = await service.get('u1', 'surto12345')
    expect(res.content?.summary).toMatch(/medicamento/)
    expect(analyzer.generate).not.toHaveBeenCalled()
    expect(repo.saveBriefing).not.toHaveBeenCalled()
  })

  it('briefing velho é refeito', async () => {
    repo.latestBriefing.mockResolvedValue({
      surtoId: 'surto12345', aiGenerated: true, generatedAt: new Date(Date.now() - 13 * 3_600_000), content: {}, stats: {}, references: [],
    })
    await service.get('u1', 'surto12345')
    expect(analyzer.generate).toHaveBeenCalledTimes(1)
  })

  it('resposta da IA com número é recusada, pede de novo com aviso e aceita a segunda', async () => {
    analyzer.generate
      .mockResolvedValueOnce(JSON.stringify({ ...JSON.parse(goodAi), summary: 'Foram 7 relatos.' }))
      .mockResolvedValueOnce(goodAi)
    const res = await service.get('u1', 'surto12345')
    expect(res.aiGenerated).toBe(true)
    expect(analyzer.generate).toHaveBeenCalledTimes(2)
    expect(analyzer.generate.mock.calls[0][0]).not.toMatch(/recusada/)
    expect(analyzer.generate.mock.calls[1][0]).toMatch(/recusada/)
  })

  it('cidade com número no nome não derruba o briefing (o número do nome é permitido)', async () => {
    repo.findSurto.mockResolvedValue({ ...surto, city: 'Cidade 7' })
    analyzer.generate.mockResolvedValueOnce(JSON.stringify({ ...JSON.parse(goodAi), summary: 'Moradores de Cidade 7 relatam falta de remédio.' }))
    const res = await service.get('u1', 'surto12345')
    expect(res.aiGenerated).toBe(true)
    expect(analyzer.generate).toHaveBeenCalledTimes(1)
  })

  it('se a IA erra ou insiste em número, mostra só os números (sem texto de IA) e guarda isso', async () => {
    analyzer.generate.mockRejectedValueOnce(new Error('429')).mockResolvedValueOnce('não é json')
    const res = await service.get('u1', 'surto12345')
    expect(res.aiGenerated).toBe(false)
    expect(res.content).toBeNull()
    expect(res.stats.totalReports).toBe(2)
    expect(res.references).toHaveLength(1)
    expect(repo.saveBriefing).toHaveBeenCalledWith(expect.objectContaining({ aiGenerated: false, model: null, content: null }))
  })

  it('sem chave da IA, vai direto para só os números', async () => {
    analyzer.available = false
    const res = await service.get('u1', 'surto12345')
    expect(res.aiGenerated).toBe(false)
    expect(analyzer.generate).not.toHaveBeenCalled()
  })

  it('surto sem relatos ligados dá 404', async () => {
    repo.loadReports.mockResolvedValue([])
    await expect(service.get('u1', 'surto12345')).rejects.toThrow(NotFoundException)
  })

  it('surto só com relato anônimo: números sim, IA não (nada público para resumir)', async () => {
    repo.loadReports.mockResolvedValue([row({ anonymous: true })])
    const res = await service.get('u1', 'surto12345')
    expect(res.aiGenerated).toBe(false)
    expect(res.stats.totalReports).toBe(2)
    expect(res.references).toEqual([])
    expect(analyzer.generate).not.toHaveBeenCalled()
  })

  it('pedidos ao mesmo tempo para o mesmo surto dividem uma geração só', async () => {
    let release!: (v: string) => void
    analyzer.generate.mockReturnValueOnce(new Promise<string>((r) => { release = r }))
    const a = service.get('u1', 'surto12345')
    const b = service.get('u2', 'surto12345')
    await new Promise((r) => setTimeout(r, 20))
    release(goodAi)
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.content?.headline).toBe(rb.content?.headline)
    expect(analyzer.generate).toHaveBeenCalledTimes(1)
    expect(repo.saveBriefing).toHaveBeenCalledTimes(1)
  })
})
