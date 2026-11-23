import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PRESS_PLAN_LIMITS } from '@votz/shared-types'
import { PressRadarService } from './press-radar.service'
import {
  DIGEST_MIN_INTERVAL_MS, effectiveFrequency, isDigestDue, placeMatches, reportDedupKey, reportWhereForRule,
  surtoDedupKey, surtoMatchesRule,
} from './press-radar.rules'
import { buildSeries, periodKey, periodsBetween } from './press-series'

const repo = {
  listRules: jest.fn(), countRules: jest.fn(), createRule: jest.fn(), findRule: jest.fn(), updateRule: jest.fn(),
  deleteRule: jest.fn(), activeRules: jest.fn(), plansByUser: jest.fn(), matchingReportIds: jest.fn(),
  createHits: jest.fn(), pendingHits: jest.fn(), markHitsSent: jest.fn(), reportsByIds: jest.fn(), surtosByIds: jest.fn(),
}
const access = { require: jest.fn() }
const mail = { sendPressRadarDigest: jest.fn().mockResolvedValue(undefined) }
const notifications = { notify: jest.fn().mockResolvedValue({}) }

const free = { plan: 'GRATUITA', limits: PRESS_PLAN_LIMITS.GRATUITA }
const pro = { plan: 'PRO', limits: PRESS_PLAN_LIMITS.PRO }
const NOW = new Date('2026-11-23T12:00:00Z')

function rule(over: Record<string, unknown> = {}) {
  return {
    id: 'r1', userId: 'u1', name: 'Saúde', kind: 'PRESSURE', states: [], cities: [], categories: [],
    minPressure: 50, stalledDays: null, frequency: 'DAILY', active: true, lastDigestAt: null,
    createdAt: new Date('2026-11-01T00:00:00Z'), updatedAt: new Date(),
    user: { id: 'u1', email: 'j@x.test', name: 'Ana' },
    ...over,
  }
}

describe('regras puras do radar', () => {
  it('lugar: vazio vale para tudo; UF e cidade comparam sem acento e sem maiúscula', () => {
    expect(placeMatches({ states: [], cities: [] }, { state: 'SP', city: 'Qualquer' })).toBe(true)
    expect(placeMatches({ states: ['sp'], cities: [] }, { state: 'SP', city: null })).toBe(true)
    expect(placeMatches({ states: ['RJ'], cities: [] }, { state: 'SP', city: null })).toBe(false)
    expect(placeMatches({ states: [], cities: ['São Paulo'] }, { state: 'SP', city: 'sao paulo' })).toBe(true)
    expect(placeMatches({ states: [], cities: ['Campinas'] }, { state: 'SP', city: 'São Paulo' })).toBe(false)
  })

  it('surto: confere tema e lugar', () => {
    const s = { state: 'SP', city: 'Campinas', category: 'HEALTH' }
    expect(surtoMatchesRule({ states: [], cities: [], categories: [] }, s)).toBe(true)
    expect(surtoMatchesRule({ states: [], cities: [], categories: ['HEALTH'] }, s)).toBe(true)
    expect(surtoMatchesRule({ states: [], cities: [], categories: ['SAFETY'] }, s)).toBe(false)
    expect(surtoMatchesRule({ states: ['RJ'], cities: [], categories: [] }, s)).toBe(false)
  })

  it('filtro de relatos: só públicos e em aberto; pressão e "sem resposta" mudam o filtro', () => {
    const pressure = reportWhereForRule(rule() as any, NOW) as any
    expect(pressure.AND).toEqual(expect.arrayContaining([{ anonymous: false }, { pressureScore: { gte: 50 } }]))
    expect(JSON.stringify(pressure)).toContain('"notIn":["ARCHIVED","RESOLVED"]')

    const stalled = reportWhereForRule(rule({ kind: 'UNANSWERED', stalledDays: 7, minPressure: null, states: ['SP'], categories: ['HEALTH'] }) as any, NOW) as any
    expect(stalled.AND).toEqual(expect.arrayContaining([
      { firstResponseAt: null },
      { state: { in: ['SP'] } },
      { category: { in: ['HEALTH'] } },
      { createdAt: { lte: new Date('2026-11-16T12:00:00Z') } },
    ]))
  })

  it('chaves de repetição: um aviso por relato; um por surto e dia', () => {
    expect(reportDedupKey('abc')).toBe('report:abc')
    expect(surtoDedupKey('s1', NOW)).toBe('surto:s1:2026-11-23')
    expect(surtoDedupKey('s1', new Date('2026-11-24T01:00:00Z'))).toBe('surto:s1:2026-11-24')
  })

  it('frequência: "na hora" só no Pro (no gratuito vira resumo diário); resumo espera ~20 h', () => {
    expect(effectiveFrequency('IMMEDIATE', 'PRO')).toBe('IMMEDIATE')
    expect(effectiveFrequency('IMMEDIATE', 'GRATUITA')).toBe('DAILY')
    expect(isDigestDue('IMMEDIATE', NOW, NOW)).toBe(true)
    expect(isDigestDue('DAILY', null, NOW)).toBe(true)
    expect(isDigestDue('DAILY', new Date(NOW.getTime() - DIGEST_MIN_INTERVAL_MS + 1000), NOW)).toBe(false)
    expect(isDigestDue('DAILY', new Date(NOW.getTime() - DIGEST_MIN_INTERVAL_MS), NOW)).toBe(true)
  })
})

describe('série histórica', () => {
  it('semana começa na segunda (UTC) e mês é AAAA-MM', () => {
    expect(periodKey(new Date('2026-11-23T10:00:00Z'), 'week')).toBe('2026-11-23') // segunda
    expect(periodKey(new Date('2026-11-29T23:59:00Z'), 'week')).toBe('2026-11-23') // domingo
    expect(periodKey(new Date('2026-11-30T00:00:00Z'), 'week')).toBe('2026-11-30')
    expect(periodKey(new Date('2026-11-23T10:00:00Z'), 'month')).toBe('2026-11')
  })

  it('lista todos os períodos, inclusive os vazios, em ordem', () => {
    expect(periodsBetween(new Date('2026-10-26T00:00:00Z'), new Date('2026-11-23T00:00:00Z'), 'week')).toEqual([
      '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23',
    ])
    expect(periodsBetween(new Date('2026-09-15T00:00:00Z'), new Date('2026-11-23T00:00:00Z'), 'month')).toEqual(['2026-09', '2026-10', '2026-11'])
  })

  it('conta por turma de entrada: respondidos, resolvidos e pressão média', () => {
    const rows = [
      { createdAt: new Date('2026-11-17T10:00:00Z'), status: 'OPEN', pressureScore: 10, firstResponseAt: null },
      { createdAt: new Date('2026-11-18T10:00:00Z'), status: 'RESOLVED', pressureScore: 30, firstResponseAt: new Date('2026-11-20T00:00:00Z') },
      { createdAt: new Date('2026-11-24T10:00:00Z'), status: 'IN_PROGRESS', pressureScore: 5, firstResponseAt: new Date('2026-11-25T00:00:00Z') },
    ]
    const out = buildSeries(rows, 'week', new Date('2026-11-09T00:00:00Z'), new Date('2026-11-25T00:00:00Z'))
    expect(out.map((r) => r.period)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23'])
    expect(out[0]).toEqual({ period: '2026-11-09', reports: 0, answered: 0, resolved: 0, avgPressure: 0 })
    expect(out[1]).toEqual({ period: '2026-11-16', reports: 2, answered: 1, resolved: 1, avgPressure: 20 })
    expect(out[2]).toEqual({ period: '2026-11-23', reports: 1, answered: 1, resolved: 0, avgPressure: 5 })
  })
})

describe('PressRadarService', () => {
  let service: PressRadarService

  beforeEach(() => {
    jest.clearAllMocks()
    access.require.mockResolvedValue(free)
    repo.countRules.mockResolvedValue(0)
    repo.createRule.mockImplementation(async (d: any) => rule({ ...d, id: 'new' }))
    repo.matchingReportIds.mockResolvedValue([])
    repo.createHits.mockResolvedValue(0)
    repo.activeRules.mockResolvedValue([])
    repo.plansByUser.mockResolvedValue(new Map())
    repo.pendingHits.mockResolvedValue([])
    service = new PressRadarService(repo as any, access as any, mail as any, notifications as any)
  })

  describe('criar regra', () => {
    it('gratuito: respeita o limite de 2 avisos e não libera "na hora"', async () => {
      repo.countRules.mockResolvedValue(2)
      await expect(service.createRule('u1', { name: 'A', kind: 'SURGE' } as any)).rejects.toThrow(/2 avisos/)

      repo.countRules.mockResolvedValue(0)
      await expect(service.createRule('u1', { name: 'Aviso', kind: 'SURGE', frequency: 'IMMEDIATE' } as any)).rejects.toThrow(ForbiddenException)
      expect(repo.createRule).not.toHaveBeenCalled()
    })

    it('Pro: 20 avisos e "na hora"', async () => {
      access.require.mockResolvedValue(pro)
      repo.countRules.mockResolvedValue(19)
      await expect(service.createRule('u1', { name: 'Aviso', kind: 'SURGE', frequency: 'IMMEDIATE' } as any)).resolves.toMatchObject({ frequency: 'IMMEDIATE' })
      repo.countRules.mockResolvedValue(20)
      await expect(service.createRule('u1', { name: 'Aviso', kind: 'SURGE' } as any)).rejects.toThrow(ForbiddenException)
    })

    it('exige pressão no aviso de pressão e dias no de "sem resposta"; surto ignora os dois', async () => {
      await expect(service.createRule('u1', { name: 'Aviso', kind: 'PRESSURE' } as any)).rejects.toThrow(BadRequestException)
      await expect(service.createRule('u1', { name: 'Aviso', kind: 'UNANSWERED' } as any)).rejects.toThrow(BadRequestException)

      await service.createRule('u1', { name: 'Aviso', kind: 'SURGE', minPressure: 80, stalledDays: 5 } as any)
      expect(repo.createRule).toHaveBeenLastCalledWith(expect.objectContaining({ minPressure: null, stalledDays: null, frequency: 'DAILY' }))
    })

    it('guarda como "já visto" o que existe agora, sem avisar (linha de base)', async () => {
      repo.matchingReportIds.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
      await service.createRule('u1', { name: 'Aviso', kind: 'PRESSURE', minPressure: 50 } as any)
      const [ruleId, hits, sentAt] = repo.createHits.mock.calls[0]
      expect(ruleId).toBe('new')
      expect(hits).toEqual([{ dedupKey: 'report:a', reportId: 'a' }, { dedupKey: 'report:b', reportId: 'b' }])
      expect(sentAt).toBeInstanceOf(Date)
      expect(mail.sendPressRadarDigest).not.toHaveBeenCalled()
    })

    it('regra de surto não faz linha de base', async () => {
      await service.createRule('u1', { name: 'Aviso', kind: 'SURGE' } as any)
      expect(repo.matchingReportIds).not.toHaveBeenCalled()
    })

    it('quem não é imprensa verificada não cria nem lista', async () => {
      access.require.mockRejectedValue(new ForbiddenException('x'))
      await expect(service.createRule('u1', { name: 'A', kind: 'SURGE' } as any)).rejects.toThrow(ForbiddenException)
      await expect(service.listRules('u1')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('editar e apagar', () => {
    it('só mexe nos próprios avisos', async () => {
      repo.findRule.mockResolvedValue(null)
      await expect(service.updateRule('u1', 'x', { active: false })).rejects.toThrow(NotFoundException)
      await expect(service.deleteRule('u1', 'x')).rejects.toThrow(NotFoundException)
      expect(repo.findRule).toHaveBeenCalledWith('x', 'u1')
    })

    it('no gratuito não troca para "na hora"; religar refaz a linha de base', async () => {
      repo.findRule.mockResolvedValue(rule({ active: false }))
      await expect(service.updateRule('u1', 'r1', { frequency: 'IMMEDIATE' })).rejects.toThrow(ForbiddenException)

      repo.updateRule.mockResolvedValue(rule({ active: true }))
      repo.matchingReportIds.mockResolvedValue([{ id: 'z' }])
      await service.updateRule('u1', 'r1', { active: true })
      expect(repo.createHits).toHaveBeenCalledWith('r1', [{ dedupKey: 'report:z', reportId: 'z' }], expect.any(Date))
    })
  })

  describe('rodada (runSweep)', () => {
    it('acha relatos novos, grava achados e entrega o resumo do dia por e-mail e sino', async () => {
      repo.activeRules.mockResolvedValue([rule()])
      repo.matchingReportIds.mockResolvedValue([{ id: 'a' }])
      repo.createHits.mockResolvedValue(1)
      repo.pendingHits.mockResolvedValue([{ id: 'h1', reportId: 'a', surtoId: null }])
      repo.reportsByIds.mockResolvedValue([
        { id: 'a', title: 'Falta de remédio', city: 'Campinas', state: 'SP', category: 'HEALTH', pressureScore: 88.4, status: 'OPEN' },
      ])

      const res = await service.runSweep(NOW)

      expect(res).toEqual({ rules: 1, newHits: 1, digests: 1 })
      expect(mail.sendPressRadarDigest).toHaveBeenCalledWith('j@x.test', 'Ana', {
        ruleName: 'Saúde',
        items: [{ title: 'Falta de remédio', detail: 'Saúde · Campinas/SP · pressão 88', path: '/relatos/a' }],
        more: 0,
      })
      expect(notifications.notify).toHaveBeenCalledWith({ userId: 'u1', type: 'PRESS_RADAR_HIT', metadata: { ruleName: 'Saúde', count: 1 } })
      expect(repo.markHitsSent).toHaveBeenCalledWith('r1', ['h1'], NOW)
    })

    it('resumo diário não sai antes de ~20 h; sem novidade, não manda nada', async () => {
      repo.activeRules.mockResolvedValue([rule({ lastDigestAt: new Date(NOW.getTime() - 3_600_000) })])
      repo.pendingHits.mockResolvedValue([{ id: 'h1', reportId: 'a', surtoId: null }])
      expect((await service.runSweep(NOW)).digests).toBe(0)
      expect(mail.sendPressRadarDigest).not.toHaveBeenCalled()

      repo.activeRules.mockResolvedValue([rule()])
      repo.pendingHits.mockResolvedValue([])
      expect((await service.runSweep(NOW)).digests).toBe(0)
    })

    it('relato resolvido desde o achado não vira aviso, mas o achado sai da fila', async () => {
      repo.activeRules.mockResolvedValue([rule()])
      repo.pendingHits.mockResolvedValue([{ id: 'h1', reportId: 'a', surtoId: null }])
      repo.reportsByIds.mockResolvedValue([{ id: 'a', title: 'x', city: 'C', state: 'SP', category: 'HEALTH', pressureScore: 90, status: 'RESOLVED' }])
      const res = await service.runSweep(NOW)
      expect(res.digests).toBe(0)
      expect(mail.sendPressRadarDigest).not.toHaveBeenCalled()
      expect(repo.markHitsSent).toHaveBeenCalledWith('r1', ['h1'], NOW)
    })

    it('mostra até 15 itens e resume o resto', async () => {
      repo.activeRules.mockResolvedValue([rule()])
      const ids = Array.from({ length: 20 }, (_, i) => `r${i}`)
      repo.pendingHits.mockResolvedValue(ids.map((id, i) => ({ id: `h${i}`, reportId: id, surtoId: null })))
      repo.reportsByIds.mockResolvedValue(ids.map((id, i) => ({ id, title: `T${i}`, city: 'C', state: 'SP', category: 'HEALTH', pressureScore: i, status: 'OPEN' })))
      await service.runSweep(NOW)
      const payload = mail.sendPressRadarDigest.mock.calls[0][2]
      expect(payload.items).toHaveLength(15)
      expect(payload.more).toBe(5)
      expect(repo.markHitsSent.mock.calls[0][1]).toHaveLength(20)
    })

    it('depois de cair para o gratuito, só as 2 primeiras regras valem e "na hora" vira resumo', async () => {
      const mk = (id: string, order: number) => rule({ id, createdAt: new Date(2026, 10, order), frequency: 'IMMEDIATE' })
      repo.activeRules.mockResolvedValue([mk('a', 1), mk('b', 2), mk('c', 3)])
      repo.plansByUser.mockResolvedValue(new Map([['u1', 'GRATUITA']]))
      repo.pendingHits.mockResolvedValue([])
      const res = await service.runSweep(NOW)
      expect(res.rules).toBe(2)
      expect(repo.matchingReportIds).toHaveBeenCalledTimes(2)
    })

    it('uma regra com erro não para as outras', async () => {
      repo.activeRules.mockResolvedValue([rule({ id: 'ruim' }), rule({ id: 'boa' })])
      repo.matchingReportIds.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([])
      const res = await service.runSweep(NOW)
      expect(res.rules).toBe(2)
      expect(repo.matchingReportIds).toHaveBeenCalledTimes(2)
    })
  })

  describe('surto ativado', () => {
    const surto = { id: 's1', category: 'HEALTH', city: 'Campinas', state: 'SP', count: 7 }

    it('cria o achado só nas regras que combinam e avisa na hora quem é Pro com "na hora"', async () => {
      repo.activeRules.mockResolvedValue([
        rule({ id: 'ok', kind: 'SURGE', userId: 'u1', frequency: 'IMMEDIATE', cities: ['campinas'] }),
        rule({ id: 'outra-cidade', kind: 'SURGE', userId: 'u2', cities: ['Santos'], user: { id: 'u2', email: 'k@x.test', name: 'Bia' } }),
      ])
      repo.plansByUser.mockResolvedValue(new Map([['u1', 'PRO']]))
      repo.pendingHits.mockResolvedValue([{ id: 'h', reportId: null, surtoId: 's1' }])
      repo.surtosByIds.mockResolvedValue([surto])

      expect(await service.onSurtoActivated(surto, NOW)).toBe(1)

      expect(repo.createHits).toHaveBeenCalledTimes(1)
      expect(repo.createHits).toHaveBeenCalledWith('ok', [{ dedupKey: 'surto:s1:2026-11-23', surtoId: 's1' }])
      expect(mail.sendPressRadarDigest.mock.calls[0][2].items[0]).toEqual({
        title: 'Surto: Saúde em Campinas/SP', detail: '7 relatos nas últimas 24 horas', path: '/surtos/s1',
      })
    })

    it('resumo diário: guarda o achado e espera a rodada', async () => {
      repo.activeRules.mockResolvedValue([rule({ id: 'dia', kind: 'SURGE', frequency: 'DAILY' })])
      expect(await service.onSurtoActivated(surto, NOW)).toBe(0)
      expect(repo.createHits).toHaveBeenCalledTimes(1)
      expect(mail.sendPressRadarDigest).not.toHaveBeenCalled()
    })

    it('sem regra que combine, não faz nada', async () => {
      repo.activeRules.mockResolvedValue([rule({ kind: 'SURGE', states: ['RJ'] })])
      expect(await service.onSurtoActivated(surto, NOW)).toBe(0)
      expect(repo.createHits).not.toHaveBeenCalled()
    })
  })
})
