import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AdsBillingService } from './ads-billing.service'
import { AdsBillingRepository } from './ads-billing.repository'
import { TestPaymentGateway } from './gateways/test-payment.gateway'
import { AsaasPaymentGateway, StripePaymentGateway } from './gateways/live-gateways'
import { CreateAdTopUpDto } from './dto/ads-billing.dto'
import { topUpLines } from './ledger'

const repo = {
  findAccount: jest.fn(),
  expirePending: jest.fn(),
  createTopUp: jest.fn(),
  findTopUp: jest.fn(),
  listTopUps: jest.fn(),
  cancelTopUp: jest.fn(),
  listStatement: jest.fn(),
  ledgerBalance: jest.fn(),
  settleTopUp: jest.fn(),
}

const now = new Date('2026-11-22T12:00:00Z')
const account = { id: 'acc1', companyId: 'co1', name: 'Conta', currency: 'BRL', timezone: 'America/Sao_Paulo', balanceCents: 7000, createdById: 'u1', createdAt: now, updatedAt: now }
const topUp = (overrides: Record<string, unknown> = {}) => ({
  id: 'tu1', adAccountId: 'acc1', amountCents: 5000, method: 'PIX', provider: 'TEST', status: 'PENDING', externalId: 'test_tu1',
  paymentCode: 'codigo', checkoutUrl: null, expiresAt: new Date('2026-11-25T12:00:00Z'), paidAt: null, createdById: 'u1', createdAt: now, updatedAt: now,
  adAccount: { companyId: 'co1' }, ...overrides,
})

describe('AdsBillingService', () => {
  let service: AdsBillingService
  let env: Record<string, string | undefined>

  beforeEach(async () => {
    jest.resetAllMocks()
    env = { NODE_ENV: 'development' }
    const module = await Test.createTestingModule({
      providers: [
        AdsBillingService,
        { provide: AdsBillingRepository, useValue: repo },
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
        TestPaymentGateway,
        AsaasPaymentGateway,
        StripePaymentGateway,
      ],
    }).compile()
    service = module.get(AdsBillingService)
  })

  describe('modo', () => {
    it('fora de produção é teste; em produção é real; ADS_BILLING_MODE manda', () => {
      expect(service.mode).toBe('test')
      env.NODE_ENV = 'production'
      expect(service.mode).toBe('live')
      env.ADS_BILLING_MODE = 'test'
      expect(service.mode).toBe('test')
    })
  })

  describe('getBilling', () => {
    it('monta o extrato com o saldo depois de cada linha e confere com o livro-caixa', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.listTopUps.mockResolvedValue([topUp({ status: 'PAID', paidAt: now })])
      // Mais nova primeiro: gasto de 1.000 e, antes dele, recarga de 8.000 (saldo atual 7.000).
      repo.listStatement.mockResolvedValue([
        { id: 'e2', type: 'SPEND', description: 'Gasto', side: 'DEBIT', amountCents: 1000, createdAt: now },
        { id: 'e1', type: 'TOPUP', description: 'Recarga por Pix', side: 'CREDIT', amountCents: 8000, createdAt: now },
      ])
      repo.ledgerBalance.mockResolvedValue(7000)
      const view = await service.getBilling('co1', 'acc1')
      expect(view.statement.map((line) => [line.amountCents, line.balanceAfterCents])).toEqual([[-1000, 7000], [8000, 8000]])
      expect(view.reconciled).toBe(true)
      expect(view.mode).toBe('test')
      expect(view.methods).toEqual(['PIX', 'BOLETO', 'CARD'])
      expect(repo.expirePending).toHaveBeenCalledWith('acc1')
    })

    it('avisa quando o saldo da conta não bate com o livro-caixa', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.listTopUps.mockResolvedValue([])
      repo.listStatement.mockResolvedValue([])
      repo.ledgerBalance.mockResolvedValue(6999)
      expect((await service.getBilling('co1', 'acc1')).reconciled).toBe(false)
    })

    it('no modo real, sem Asaas e Stripe ligados, nenhuma forma de pagar aparece', async () => {
      env.ADS_BILLING_MODE = 'live'
      repo.findAccount.mockResolvedValue(account)
      repo.listTopUps.mockResolvedValue([])
      repo.listStatement.mockResolvedValue([])
      repo.ledgerBalance.mockResolvedValue(7000)
      expect((await service.getBilling('co1', 'acc1')).methods).toEqual([])
    })

    it('conta de outra empresa dá 404', async () => {
      repo.findAccount.mockResolvedValue({ ...account, companyId: 'outra' })
      await expect(service.getBilling('co1', 'acc1')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('createTopUp', () => {
    it('cria a recarga pendente com código de teste, sem mexer no saldo', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.createTopUp.mockImplementation(async (data) => ({ ...topUp(), ...data }))
      const view = await service.createTopUp('co1', 'acc1', 'u1', { amountCents: 5000, method: 'PIX' })
      expect(repo.createTopUp).toHaveBeenCalledWith(expect.objectContaining({ adAccountId: 'acc1', amountCents: 5000, provider: 'TEST', createdById: 'u1' }))
      expect(view.status).toBe('PENDING')
      expect(view.paymentCode).toMatch(/TESTE/)
      expect(repo.settleTopUp).not.toHaveBeenCalled()
    })

    it('no modo real sem provedor ligado, recusa em vez de gravar', async () => {
      env.ADS_BILLING_MODE = 'live'
      repo.findAccount.mockResolvedValue(account)
      await expect(service.createTopUp('co1', 'acc1', 'u1', { amountCents: 5000, method: 'PIX' })).rejects.toBeInstanceOf(BadRequestException)
      expect(repo.createTopUp).not.toHaveBeenCalled()
    })

    it('conta de outra empresa dá 404', async () => {
      repo.findAccount.mockResolvedValue({ ...account, companyId: 'outra' })
      await expect(service.createTopUp('co1', 'acc1', 'u1', { amountCents: 5000, method: 'PIX' })).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('confirmTestTopUp', () => {
    it('credita pelo livro-caixa e devolve a recarga paga', async () => {
      repo.findTopUp.mockResolvedValueOnce(topUp()).mockResolvedValueOnce(topUp({ status: 'PAID', paidAt: now }))
      repo.settleTopUp.mockResolvedValue(true)
      const view = await service.confirmTestTopUp('co1', 'tu1')
      expect(repo.settleTopUp).toHaveBeenCalledWith('tu1', topUpLines)
      expect(view.status).toBe('PAID')
    })

    it('não existe no modo real', async () => {
      env.ADS_BILLING_MODE = 'live'
      await expect(service.confirmTestTopUp('co1', 'tu1')).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.settleTopUp).not.toHaveBeenCalled()
    })

    it('recarga de outra empresa dá 404 e recarga de provedor real não confirma', async () => {
      repo.findTopUp.mockResolvedValueOnce(topUp({ adAccount: { companyId: 'outra' } }))
      await expect(service.confirmTestTopUp('co1', 'tu1')).rejects.toBeInstanceOf(NotFoundException)
      repo.findTopUp.mockResolvedValueOnce(topUp({ provider: 'ASAAS' }))
      await expect(service.confirmTestTopUp('co1', 'tu1')).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.settleTopUp).not.toHaveBeenCalled()
    })
  })

  describe('settleTopUp', () => {
    it('avisa se creditou ou se já estava paga (aviso repetido não credita duas vezes)', async () => {
      repo.settleTopUp.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      await expect(service.settleTopUp('tu1')).resolves.toEqual({ credited: true })
      await expect(service.settleTopUp('tu1')).resolves.toEqual({ credited: false })
    })

    it('recarga que não existe dá 404', async () => {
      repo.settleTopUp.mockResolvedValue(null)
      await expect(service.settleTopUp('x')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('cancelTopUp', () => {
    it('cancela só o que espera pagamento', async () => {
      repo.findTopUp.mockResolvedValueOnce(topUp()).mockResolvedValueOnce(topUp({ status: 'CANCELED' }))
      repo.cancelTopUp.mockResolvedValue(true)
      expect((await service.cancelTopUp('co1', 'tu1')).status).toBe('CANCELED')

      repo.findTopUp.mockResolvedValueOnce(topUp({ status: 'PAID' }))
      await expect(service.cancelTopUp('co1', 'tu1')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('se mudou no meio do caminho, dá 409', async () => {
      repo.findTopUp.mockResolvedValue(topUp())
      repo.cancelTopUp.mockResolvedValue(false)
      await expect(service.cancelTopUp('co1', 'tu1')).rejects.toBeInstanceOf(ConflictException)
    })
  })
})

describe('CreateAdTopUpDto', () => {
  const check = async (body: object) => (await validate(plainToInstance(CreateAdTopUpDto, body))).flatMap((e) => Object.values(e.constraints ?? {}))
  it('aceita valor dentro dos limites', async () => expect(await check({ amountCents: 2000, method: 'PIX' })).toEqual([]))
  it('recusa menos de R$ 20, mais de R$ 10.000, centavos quebrados e forma desconhecida', async () => {
    expect(await check({ amountCents: 1999, method: 'PIX' })).toContain('A recarga mínima é de R$ 20,00.')
    expect(await check({ amountCents: 1_000_001, method: 'PIX' })).toContain('A recarga máxima por pedido é de R$ 10.000,00.')
    expect((await check({ amountCents: 2500.5, method: 'PIX' })).length).toBeGreaterThan(0)
    expect((await check({ amountCents: 5000, method: 'CHEQUE' })).length).toBeGreaterThan(0)
  })
})
