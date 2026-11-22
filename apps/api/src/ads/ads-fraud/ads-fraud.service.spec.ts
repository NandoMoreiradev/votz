// jsdom não carrega no Jest; o mesmo efeito do sanitize com tags proibidas.
jest.mock('isomorphic-dompurify', () => {
  const sanitize = (v: string) => v.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '')
  return { __esModule: true, default: { sanitize }, sanitize }
})

import { ConflictException, NotFoundException } from '@nestjs/common'
import type { NotificationsService } from '../../notifications/notifications.service'
import type { AdsFraudRepository, DayFacts } from './ads-fraud.repository'
import { AdsFraudService } from './ads-fraud.service'

const NOW = new Date('2026-11-22T15:00:00.000Z')
const TODAY = new Date('2026-11-22T00:00:00.000Z')

const fact = (patch: Partial<DayFacts> = {}): DayFacts => ({
  adId: 'ad-1',
  adSetId: 'set-1',
  day: TODAY,
  viewable: 1000,
  clicks: 300,
  grossSpendMillicentsNow: 120_000,
  adName: 'Anúncio',
  adStatus: 'ACTIVE',
  campaignName: 'Campanha',
  chargeOn: 'CLICK',
  accountId: 'acc-1',
  companyId: 'co-1',
  ...patch,
})

function build(patch: Partial<Record<keyof AdsFraudRepository, jest.Mock>> = {}) {
  const repo = {
    candidateDays: jest.fn().mockResolvedValue([fact()]),
    clicksWithoutView: jest.fn().mockResolvedValue(new Map()),
    applyFinding: jest.fn().mockResolvedValue({ flagId: 'f1', created: true, level: 'REVIEW', creditedMillicents: 80_000, creditedNowMillicents: 80_000, pausedNow: false }),
    findAdvertiserUserIds: jest.fn().mockResolvedValue(['u1', 'u2']),
    listFlags: jest.fn(),
    findFlag: jest.fn(),
    resolveFlag: jest.fn().mockResolvedValue(true),
    ...patch,
  } as unknown as jest.Mocked<AdsFraudRepository>
  const notifications = { notify: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<NotificationsService>
  return { repo, notifications, service: new AdsFraudService(repo, notifications) }
}

describe('AdsFraudService.scan', () => {
  it('olha hoje e ontem (dia de São Paulo) e só os anúncios com cliques suficientes', async () => {
    const { repo, service } = build({ candidateDays: jest.fn().mockResolvedValue([]) })
    expect(await service.scan(NOW)).toEqual({ examined: 0, flagged: 0, creditedMillicents: 0, paused: 0 })
    const [days, minClicks] = repo.candidateDays.mock.calls[0]
    expect((days as Date[]).map((day) => day.toISOString().slice(0, 10))).toEqual(['2026-11-22', '2026-11-21'])
    expect(minClicks).toBe(20)
  })

  it('tráfego normal não gera caso nem aviso', async () => {
    const { repo, notifications, service } = build({ candidateDays: jest.fn().mockResolvedValue([fact({ viewable: 5000, clicks: 150 })]) })
    const run = await service.scan(NOW)
    expect(run).toMatchObject({ examined: 1, flagged: 0 })
    expect(repo.applyFinding).not.toHaveBeenCalled()
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it('taxa de cliques anormal abre o caso, credita e avisa quem gerencia anúncios', async () => {
    const { repo, notifications, service } = build()
    const run = await service.scan(NOW)
    expect(run).toEqual({ examined: 1, flagged: 1, creditedMillicents: 80_000, paused: 0 })
    expect(repo.applyFinding).toHaveBeenCalledWith(expect.objectContaining({ adId: 'ad-1' }), expect.objectContaining({ level: 'REVIEW', signals: ['CTR_ABNORMAL'], invalidClicks: 200 }), 0)
    expect(notifications.notify).toHaveBeenCalledTimes(2)
    expect(notifications.notify).toHaveBeenCalledWith({ userId: 'u1', type: 'AD_INVALID_TRAFFIC', metadata: { adId: 'ad-1', campaignName: 'Campanha', creditCents: 80, paused: false } })
  })

  it('cliques sem exibição vista entram no julgamento do dia certo', async () => {
    const { repo, service } = build({
      candidateDays: jest.fn().mockResolvedValue([fact({ viewable: 5000, clicks: 40 })]),
      clicksWithoutView: jest.fn().mockImplementation(async (_ids: string[], from: Date) =>
        from.toISOString() === '2026-11-22T03:00:00.000Z' ? new Map([['ad-1', 30]]) : new Map(),
      ),
    })
    await service.scan(NOW)
    expect(repo.applyFinding).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ signals: ['CLICKS_WITHOUT_VIEW'], invalidClicks: 30 }), 30)
  })

  it('caso extremo pausa e o aviso diz que pausou', async () => {
    const { notifications, service } = build({
      candidateDays: jest.fn().mockResolvedValue([fact({ viewable: 1000, clicks: 500 })]),
      applyFinding: jest.fn().mockResolvedValue({ flagId: 'f1', created: true, level: 'EXTREME', creditedMillicents: 0, creditedNowMillicents: 0, pausedNow: true }),
    })
    const run = await service.scan(NOW)
    expect(run.paused).toBe(1)
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ paused: true }) }))
  })

  it('caso que já existia e nada mudou não avisa de novo; caso já resolvido é ignorado', async () => {
    const again = build({ applyFinding: jest.fn().mockResolvedValue({ flagId: 'f1', created: false, level: 'REVIEW', creditedMillicents: 80_000, creditedNowMillicents: 0, pausedNow: false }) })
    await again.service.scan(NOW)
    expect(again.notifications.notify).not.toHaveBeenCalled()
    const resolved = build({ applyFinding: jest.fn().mockResolvedValue(null) })
    expect(await resolved.service.scan(NOW)).toMatchObject({ examined: 1, flagged: 0 })
    expect(resolved.notifications.notify).not.toHaveBeenCalled()
  })

  it('um anúncio com erro não impede os outros; falha do aviso não desfaz nada', async () => {
    const apply = jest.fn().mockRejectedValueOnce(new Error('banco')).mockResolvedValue({ flagId: 'f2', created: true, level: 'REVIEW', creditedMillicents: 0, creditedNowMillicents: 0, pausedNow: false })
    const { notifications, service } = build({
      candidateDays: jest.fn().mockResolvedValue([fact({ adId: 'a' }), fact({ adId: 'b' })]),
      applyFinding: apply,
      findAdvertiserUserIds: jest.fn().mockRejectedValue(new Error('sem equipe')),
    })
    const run = await service.scan(NOW)
    expect(run.flagged).toBe(1)
    expect(notifications.notify).not.toHaveBeenCalled()
  })
})

describe('AdsFraudService: fila da moderação', () => {
  const MOD = { id: 'mod-1' }

  it('resolve um caso aberto e limpa a nota', async () => {
    const { repo, service } = build({ findFlag: jest.fn().mockResolvedValue({ id: 'f1', status: 'OPEN' }) })
    await expect(service.resolve('f1', MOD, { resolution: 'DISMISSED', note: '  <b>era promoção</b>  de fim de semana ' }, NOW)).resolves.toEqual({ id: 'f1', resolution: 'DISMISSED' })
    expect(repo.resolveFlag).toHaveBeenCalledWith({ flagId: 'f1', resolution: 'DISMISSED', resolvedById: 'mod-1', note: 'era promoção de fim de semana', now: NOW })
  })

  it('caso que não existe dá 404 e caso já resolvido dá 409', async () => {
    await expect(build({ findFlag: jest.fn().mockResolvedValue(null) }).service.resolve('x', MOD, { resolution: 'CONFIRMED' })).rejects.toBeInstanceOf(NotFoundException)
    await expect(build({ findFlag: jest.fn().mockResolvedValue({ id: 'f1', status: 'CONFIRMED' }) }).service.resolve('f1', MOD, { resolution: 'CONFIRMED' })).rejects.toBeInstanceOf(ConflictException)
  })

  it('duas pessoas ao mesmo tempo: quem chega depois recebe 409', async () => {
    const { service } = build({ findFlag: jest.fn().mockResolvedValue({ id: 'f1', status: 'OPEN' }), resolveFlag: jest.fn().mockResolvedValue(false) })
    await expect(service.resolve('f1', MOD, { resolution: 'CONFIRMED' })).rejects.toBeInstanceOf(ConflictException)
  })
})
