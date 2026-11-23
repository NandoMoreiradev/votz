import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { AdsAutoTopUpService } from './ads-auto-topup.service'

const NOW = new Date('2026-11-23T15:00:00Z')

const config = (over: Record<string, unknown> = {}) => ({
  adAccountId: 'acc-1',
  enabled: true,
  thresholdCents: 5_000,
  amountCents: 10_000,
  monthlyLimitCents: 50_000,
  provider: 'TEST',
  paymentMethodRef: 'test_card',
  consentAt: new Date('2026-11-01T00:00:00Z'),
  consentById: 'u1',
  lastTriggeredAt: null,
  consecutiveFailures: 0,
  stoppedReason: null,
  adAccount: { id: 'acc-1', name: 'Conta principal', companyId: 'co-1', balanceCents: 1_000, pendingSpendMillicents: 0, _count: { campaigns: 1 } },
  ...over,
})

function setup(gateway: unknown = { provider: 'TEST', chargeSavedMethod: jest.fn().mockResolvedValue({ externalId: 'ext-1', paid: true }) }) {
  const repo = {
    find: jest.fn(),
    upsert: jest.fn().mockResolvedValue(undefined),
    disable: jest.fn().mockResolvedValue(undefined),
    usedInMonth: jest.fn().mockResolvedValue(0),
    hasPendingAuto: jest.fn().mockResolvedValue(false),
    listEnabled: jest.fn().mockResolvedValue([config()]),
    claim: jest.fn().mockResolvedValue(true),
    recordFailure: jest.fn().mockResolvedValue(1),
    resetFailures: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  }
  const billingRepo = { findAccount: jest.fn().mockResolvedValue({ id: 'acc-1', companyId: 'co-1' }), createTopUp: jest.fn().mockResolvedValue(undefined) }
  const billing = { savedMethodGateway: jest.fn().mockReturnValue(gateway), settleTopUp: jest.fn().mockResolvedValue({ credited: true }) }
  const notifier = { notify: jest.fn().mockResolvedValue(undefined) }
  return { repo, billingRepo, billing, notifier, gateway: gateway as { chargeSavedMethod: jest.Mock }, service: new AdsAutoTopUpService(repo as never, billingRepo as never, billing as never, notifier as never) }
}

describe('AdsAutoTopUpService.set', () => {
  const input = { enabled: true, thresholdCents: 5_000, amountCents: 10_000, monthlyLimitCents: 50_000, acceptCharges: true }

  it('liga com aceite e grava quem aceitou e quando (cartão de teste no modo de teste)', async () => {
    const { repo, service } = setup()
    repo.find.mockResolvedValue(config())
    await service.set('co-1', 'acc-1', 'u1', input, NOW)
    expect(repo.upsert).toHaveBeenCalledWith('acc-1', expect.objectContaining({ enabled: true, provider: 'TEST', paymentMethodRef: 'test_card', consentAt: NOW, consentById: 'u1' }))
  })

  it('sem aceite não liga', async () => {
    const { repo, service } = setup()
    await expect(service.set('co-1', 'acc-1', 'u1', { ...input, acceptCharges: false }, NOW)).rejects.toThrow(BadRequestException)
    expect(repo.upsert).not.toHaveBeenCalled()
  })

  it('sem provedor de cartão pronto, avisa que não está disponível', async () => {
    const { repo, service } = setup(null)
    await expect(service.set('co-1', 'acc-1', 'u1', input, NOW)).rejects.toThrow(ServiceUnavailableException)
    expect(repo.upsert).not.toHaveBeenCalled()
  })

  it('desligar não exige aceite nem provedor', async () => {
    const { repo, service } = setup(null)
    repo.find.mockResolvedValue(config({ enabled: false }))
    await service.set('co-1', 'acc-1', 'u1', { ...input, enabled: false, acceptCharges: false }, NOW)
    expect(repo.disable).toHaveBeenCalledWith('acc-1')
  })

  it('conta de outra empresa é "não encontrada"', async () => {
    const { billingRepo, service } = setup()
    billingRepo.findAccount.mockResolvedValue({ id: 'acc-1', companyId: 'outra' })
    await expect(service.set('co-1', 'acc-1', 'u1', input, NOW)).rejects.toThrow(NotFoundException)
  })
})

describe('AdsAutoTopUpService.run', () => {
  it('cobra o cartão, grava a recarga como automática e credita', async () => {
    const { repo, billingRepo, billing, gateway, service } = setup()
    expect(await service.run(NOW)).toEqual({ charged: 1, stopped: 0, failed: 0 })
    expect(gateway.chargeSavedMethod).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 10_000, method: 'CARD', paymentMethodRef: 'test_card' }))
    expect(billingRepo.createTopUp).toHaveBeenCalledWith(expect.objectContaining({ adAccountId: 'acc-1', amountCents: 10_000, auto: true, createdById: 'u1' }))
    expect(billing.settleTopUp).toHaveBeenCalledTimes(1)
    expect(repo.resetFailures).toHaveBeenCalledWith('acc-1')
  })

  it('saldo acima do piso: não cobra', async () => {
    const { repo, gateway, service } = setup()
    repo.listEnabled.mockResolvedValue([config({ adAccount: { ...config().adAccount, balanceCents: 9_000 } })])
    expect(await service.run(NOW)).toEqual({ charged: 0, stopped: 0, failed: 0 })
    expect(gateway.chargeSavedMethod).not.toHaveBeenCalled()
  })

  it('outra instância reservou a vez: não cobra de novo (nada de cobrança dupla)', async () => {
    const { repo, gateway, service } = setup()
    repo.claim.mockResolvedValue(false)
    await service.run(NOW)
    expect(gateway.chargeSavedMethod).not.toHaveBeenCalled()
  })

  it('o provedor recusa: conta a falha, não grava recarga e não credita', async () => {
    const { repo, billingRepo, billing, gateway, service } = setup()
    gateway.chargeSavedMethod.mockRejectedValue(new Error('cartão recusado'))
    repo.recordFailure.mockResolvedValue(1)
    expect(await service.run(NOW)).toEqual({ charged: 0, stopped: 0, failed: 1 })
    expect(billingRepo.createTopUp).not.toHaveBeenCalled()
    expect(billing.settleTopUp).not.toHaveBeenCalled()
    expect(repo.stop).not.toHaveBeenCalled()
  })

  it('na terceira falha seguida desliga e avisa o anunciante', async () => {
    const { repo, notifier, gateway, service } = setup()
    gateway.chargeSavedMethod.mockRejectedValue(new Error('cartão recusado'))
    repo.recordFailure.mockResolvedValue(3)
    await service.run(NOW)
    expect(repo.stop).toHaveBeenCalledWith('acc-1', expect.stringMatching(/3 vezes seguidas/))
    expect(notifier.notify).toHaveBeenCalledWith('co-1', 'AD_AUTO_TOPUP_STOPPED', expect.objectContaining({ accountId: 'acc-1' }))
  })

  it('bateu o teto do mês: desliga, avisa e não cobra', async () => {
    const { repo, notifier, gateway, service } = setup()
    repo.usedInMonth.mockResolvedValue(45_000)
    expect(await service.run(NOW)).toEqual({ charged: 0, stopped: 1, failed: 0 })
    expect(gateway.chargeSavedMethod).not.toHaveBeenCalled()
    expect(notifier.notify).toHaveBeenCalledWith('co-1', 'AD_AUTO_TOPUP_STOPPED', expect.objectContaining({ reason: expect.stringMatching(/teto/) }))
  })

  it('uma conta com erro não impede as outras', async () => {
    const { repo, gateway, service } = setup()
    const second = config({ adAccountId: 'acc-2', adAccount: { ...config().adAccount, id: 'acc-2' } })
    repo.listEnabled.mockResolvedValue([config(), second])
    repo.usedInMonth.mockRejectedValueOnce(new Error('banco')).mockResolvedValue(0)
    expect((await service.run(NOW)).charged).toBe(1)
    expect(gateway.chargeSavedMethod).toHaveBeenCalledTimes(1)
  })
})
