import type { NotificationsService } from '../../notifications/notifications.service'
import type { AdsAlertsRepository } from './ads-alerts.repository'
import { AdsAlertsService } from './ads-alerts.service'
import { availableCents, isLowBalance } from './balance-rules'

const NOW = new Date('2026-11-22T15:00:00.000Z')

describe('regra de saldo baixo', () => {
  it('descontar o gasto ainda não lançado do saldo', () => {
    expect(availableCents({ balanceCents: 1000, pendingSpendMillicents: 500 })).toBe(999)
    expect(availableCents({ balanceCents: 1000, pendingSpendMillicents: 0 })).toBe(1000)
  })

  it('baixo é quando o saldo não cobre um dia do orçamento das campanhas ligadas', () => {
    expect(isLowBalance({ balanceCents: 4000, pendingSpendMillicents: 0, dailyBudgetsCents: [2500, 2500] })).toBe(true)
    expect(isLowBalance({ balanceCents: 5000, pendingSpendMillicents: 0, dailyBudgetsCents: [2500, 2500] })).toBe(false)
    expect(isLowBalance({ balanceCents: 5000, pendingSpendMillicents: 1000, dailyBudgetsCents: [2500, 2500] })).toBe(true)
  })

  it('sem campanha ligada nunca é baixo', () => {
    expect(isLowBalance({ balanceCents: 0, pendingSpendMillicents: 0, dailyBudgetsCents: [] })).toBe(false)
  })
})

describe('AdsAlertsService', () => {
  function build(patch: Partial<Record<keyof AdsAlertsRepository, jest.Mock>> = {}) {
    const repo = {
      accountsPausedWithoutNotice: jest.fn().mockResolvedValue([]),
      claimPausedNotice: jest.fn().mockResolvedValue(true),
      accountsForLowBalanceCheck: jest.fn().mockResolvedValue([]),
      claimLowBalanceNotice: jest.fn().mockResolvedValue(true),
      resetLowBalanceNotice: jest.fn().mockResolvedValue(undefined),
      findAdvertiserUserIds: jest.fn().mockResolvedValue(['u1', 'u2']),
      ...patch,
    } as unknown as jest.Mocked<AdsAlertsRepository>
    const notifications = { notify: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<NotificationsService>
    return { repo, notifications, service: new AdsAlertsService(repo, notifications) }
  }

  const account = (patch: Record<string, unknown> = {}) => ({
    id: 'acc-1',
    name: 'Conta principal',
    companyId: 'co-1',
    balanceCents: 1000,
    pendingSpendMillicents: 0,
    lowBalanceAlertedAt: null,
    campaigns: [{ adSets: [{ dailyBudgetCents: 5000 }] }],
    ...patch,
  })

  it('avisa quem gerencia anúncios quando as campanhas pausam por falta de saldo', async () => {
    const pausedAt = new Date('2026-11-22T14:00:00.000Z')
    const { repo, notifications, service } = build({
      accountsPausedWithoutNotice: jest.fn().mockResolvedValue([{ id: 'acc-1', name: 'Conta principal', companyId: 'co-1', pausedForBalanceAt: pausedAt, pausedAlertSentAt: null }]),
    })
    const run = await service.run(NOW)
    expect(run.pausedNotices).toBe(1)
    expect(repo.claimPausedNotice).toHaveBeenCalledWith('acc-1', null, NOW)
    expect(notifications.notify).toHaveBeenCalledTimes(2)
    expect(notifications.notify).toHaveBeenCalledWith({ userId: 'u1', type: 'AD_PAUSED_NO_BALANCE', metadata: { accountId: 'acc-1', accountName: 'Conta principal' } })
  })

  it('outra instância que chegou primeiro: não avisa de novo', async () => {
    const { notifications, service } = build({
      accountsPausedWithoutNotice: jest.fn().mockResolvedValue([{ id: 'acc-1', name: 'x', companyId: 'co-1', pausedForBalanceAt: NOW, pausedAlertSentAt: null }]),
      claimPausedNotice: jest.fn().mockResolvedValue(false),
    })
    expect((await service.run(NOW)).pausedNotices).toBe(0)
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it('avisa de saldo baixo uma vez, com o saldo disponível', async () => {
    const { repo, notifications, service } = build({ accountsForLowBalanceCheck: jest.fn().mockResolvedValue([account({ pendingSpendMillicents: 2000 })]) })
    const run = await service.run(NOW)
    expect(run.lowBalanceNotices).toBe(1)
    expect(repo.claimLowBalanceNotice).toHaveBeenCalledWith('acc-1', NOW)
    expect(notifications.notify).toHaveBeenCalledWith({ userId: 'u1', type: 'AD_LOW_BALANCE', metadata: { accountId: 'acc-1', accountName: 'Conta principal', availableCents: 998 } })
  })

  it('já avisado e ainda baixo: não repete', async () => {
    const { notifications, service } = build({ accountsForLowBalanceCheck: jest.fn().mockResolvedValue([account({ lowBalanceAlertedAt: NOW })]) })
    const run = await service.run(NOW)
    expect(run).toEqual({ pausedNotices: 0, lowBalanceNotices: 0, lowBalanceReset: 0 })
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it('saldo recuperou depois de recarga: zera o controle para poder avisar de novo no futuro', async () => {
    const { repo, notifications, service } = build({ accountsForLowBalanceCheck: jest.fn().mockResolvedValue([account({ balanceCents: 20000, lowBalanceAlertedAt: NOW })]) })
    const run = await service.run(NOW)
    expect(run.lowBalanceReset).toBe(1)
    expect(repo.resetLowBalanceNotice).toHaveBeenCalledWith('acc-1')
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it('campanhas todas paradas depois de avisar: zera o controle também', async () => {
    const { repo, service } = build({ accountsForLowBalanceCheck: jest.fn().mockResolvedValue([account({ campaigns: [], lowBalanceAlertedAt: NOW })]) })
    expect((await service.run(NOW)).lowBalanceReset).toBe(1)
    expect(repo.resetLowBalanceNotice).toHaveBeenCalled()
  })

  it('uma conta com erro não impede o aviso das outras', async () => {
    const claim = jest.fn().mockRejectedValueOnce(new Error('banco')).mockResolvedValue(true)
    const { service } = build({
      accountsForLowBalanceCheck: jest.fn().mockResolvedValue([account({ id: 'a' }), account({ id: 'b' })]),
      claimLowBalanceNotice: claim,
    })
    expect((await service.run(NOW)).lowBalanceNotices).toBe(1)
  })

  it('sem ninguém para avisar, não quebra', async () => {
    const { notifications, service } = build({
      accountsForLowBalanceCheck: jest.fn().mockResolvedValue([account()]),
      findAdvertiserUserIds: jest.fn().mockResolvedValue([]),
    })
    await expect(service.run(NOW)).resolves.toBeDefined()
    expect(notifications.notify).not.toHaveBeenCalled()
  })
})
