import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { AdsRefundsService } from './ads-refunds.service'

jest.mock('isomorphic-dompurify', () => ({ sanitize: (text: string) => text.replace(/<[^>]*>/g, '') }))

const refundRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  adAccountId: 'acc-1',
  amountCents: 5_000,
  status: 'REQUESTED',
  reason: null,
  resolutionNote: null,
  requestedAt: new Date('2026-11-23T12:00:00Z'),
  resolvedAt: null,
  adAccount: { companyId: 'co-1', name: 'Conta principal' },
  ...over,
})

function setup() {
  const repo = { createRefund: jest.fn(), find: jest.fn(), resolveRefund: jest.fn(), queue: jest.fn() }
  const billing = { findAccount: jest.fn().mockResolvedValue({ id: 'acc-1', companyId: 'co-1' }) }
  const notifier = { notify: jest.fn().mockResolvedValue(undefined) }
  return { repo, billing, notifier, service: new AdsRefundsService(repo as never, billing as never, notifier as never) }
}

describe('AdsRefundsService', () => {
  describe('pedir devolução', () => {
    it('cria o pedido e devolve a visão (motivo sem marcação HTML)', async () => {
      const { repo, service } = setup()
      repo.createRefund.mockResolvedValue({ ok: true, refundId: 'r1' })
      repo.find.mockResolvedValue(refundRow({ reason: 'Fim da campanha' }))
      const view = await service.request('co-1', 'acc-1', 'u1', { amountCents: 5_000, reason: '<b>Fim</b> da   campanha' })
      expect(repo.createRefund).toHaveBeenCalledWith('acc-1', 5_000, 'Fim da campanha', 'u1')
      expect(view).toMatchObject({ id: 'r1', status: 'REQUESTED', amountCents: 5_000 })
    })

    it('o problema do valor vira erro para a pessoa', async () => {
      const { repo, service } = setup()
      repo.createRefund.mockResolvedValue({ ok: false, problem: 'O valor passa do que dá para devolver agora.' })
      await expect(service.request('co-1', 'acc-1', 'u1', { amountCents: 999_999 })).rejects.toThrow(BadRequestException)
    })

    it('conta de outra empresa é "não encontrada" e nada é criado', async () => {
      const { repo, billing, service } = setup()
      billing.findAccount.mockResolvedValue({ id: 'acc-1', companyId: 'outra' })
      await expect(service.request('co-1', 'acc-1', 'u1', { amountCents: 5_000 })).rejects.toThrow(NotFoundException)
      expect(repo.createRefund).not.toHaveBeenCalled()
    })
  })

  describe('cancelar', () => {
    it('cancela um pedido da própria empresa que ainda espera', async () => {
      const { repo, service } = setup()
      repo.find.mockResolvedValueOnce(refundRow()).mockResolvedValueOnce(refundRow({ status: 'CANCELED' }))
      repo.resolveRefund.mockResolvedValue(true)
      const view = await service.cancel('co-1', 'r1', 'u1')
      expect(repo.resolveRefund).toHaveBeenCalledWith('r1', 'CANCELED', { userId: 'u1' })
      expect(view.status).toBe('CANCELED')
    })

    it('pedido de outra empresa ou já resolvido não cancela', async () => {
      const { repo, service } = setup()
      repo.find.mockResolvedValue(refundRow({ adAccount: { companyId: 'outra', name: 'x' } }))
      await expect(service.cancel('co-1', 'r1', 'u1')).rejects.toThrow(NotFoundException)
      repo.find.mockResolvedValue(refundRow({ status: 'PAID' }))
      await expect(service.cancel('co-1', 'r1', 'u1')).rejects.toThrow(BadRequestException)
      expect(repo.resolveRefund).not.toHaveBeenCalled()
    })

    it('se mudou ao mesmo tempo, avisa para atualizar', async () => {
      const { repo, service } = setup()
      repo.find.mockResolvedValue(refundRow())
      repo.resolveRefund.mockResolvedValue(false)
      await expect(service.cancel('co-1', 'r1', 'u1')).rejects.toThrow(ConflictException)
    })
  })

  describe('equipe do Votz resolve', () => {
    it('marcar como devolvido avisa a empresa', async () => {
      const { repo, notifier, service } = setup()
      repo.find.mockResolvedValueOnce(refundRow()).mockResolvedValueOnce(refundRow({ status: 'PAID' }))
      repo.resolveRefund.mockResolvedValue(true)
      await service.resolve('r1', 'admin-1', { decision: 'PAID', externalId: ' E2E123 ' })
      expect(repo.resolveRefund).toHaveBeenCalledWith('r1', 'PAID', { userId: 'admin-1', note: null, externalId: 'E2E123' })
      expect(notifier.notify).toHaveBeenCalledWith('co-1', 'AD_REFUND_PAID', expect.objectContaining({ amountCents: 5_000 }))
    })

    it('recusar exige motivo e o motivo vai no aviso', async () => {
      const { repo, notifier, service } = setup()
      repo.find.mockResolvedValue(refundRow())
      await expect(service.resolve('r1', 'admin-1', { decision: 'REJECTED' })).rejects.toThrow(BadRequestException)
      await expect(service.resolve('r1', 'admin-1', { decision: 'REJECTED', note: 'curto' })).rejects.toThrow(BadRequestException)
      expect(repo.resolveRefund).not.toHaveBeenCalled()
      repo.resolveRefund.mockResolvedValue(true)
      await service.resolve('r1', 'admin-1', { decision: 'REJECTED', note: 'Conta com cobrança em análise.' })
      expect(notifier.notify).toHaveBeenCalledWith('co-1', 'AD_REFUND_REJECTED', expect.objectContaining({ reason: 'Conta com cobrança em análise.' }))
    })

    it('quem chega depois não resolve de novo e ninguém é avisado', async () => {
      const { repo, notifier, service } = setup()
      repo.find.mockResolvedValue(refundRow())
      repo.resolveRefund.mockResolvedValue(false)
      await expect(service.resolve('r1', 'admin-2', { decision: 'PAID' })).rejects.toThrow(ConflictException)
      expect(notifier.notify).not.toHaveBeenCalled()
    })

    it('pedido que não existe dá 404', async () => {
      const { repo, service } = setup()
      repo.find.mockResolvedValue(null)
      await expect(service.resolve('nope', 'admin-1', { decision: 'PAID' })).rejects.toThrow(NotFoundException)
    })

    it('a fila traz a empresa e a conta', async () => {
      const { repo, service } = setup()
      repo.queue.mockResolvedValue([{ ...refundRow(), adAccount: { id: 'acc-1', name: 'Conta principal', company: { id: 'co-1', tradeName: 'Padaria', cnpj: '00000000000191' } } }])
      expect(await service.queue()).toEqual([expect.objectContaining({ id: 'r1', companyName: 'Padaria', companyCnpj: '00000000000191', accountId: 'acc-1' })])
    })
  })
})
