import { BadRequestException, Logger, NotFoundException } from '@nestjs/common'
import { OrgType } from '@prisma/client'

process.env.STRIPE_POLITICIAN_MANDATO_PRICE_ID = 'price_pol_mandato'
process.env.STRIPE_POLITICIAN_MANDATO_PRO_PRICE_ID = 'price_pol_pro'
process.env.STRIPE_ENTITY_GESTAO_PRICE_ID = 'price_ent_gestao'

const stripeMock = {
  customers: { create: jest.fn() },
  checkout: { sessions: { create: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
  webhooks: { constructEvent: jest.fn() },
}

jest.mock('stripe', () => jest.fn(() => stripeMock))

import { SubscricoesService } from './subscricoes.service'

describe('SubscricoesService', () => {
  let service: SubscricoesService
  let prisma: any
  let config: any

  beforeEach(() => {
    jest.clearAllMocks()
    prisma = {
      entity: { findUnique: jest.fn(), update: jest.fn() },
      politician: { findUnique: jest.fn(), update: jest.fn() },
      company: { findUnique: jest.fn(), update: jest.fn() },
      stripeEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    }
    config = {
      getOrThrow: jest.fn((k: string) => {
        if (k === 'STRIPE_SECRET_KEY') return 'sk_test_123'
        if (k === 'WEB_URL') return 'http://localhost:5173'
        if (k === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test'
        throw new Error(k)
      }),
    }
    service = new SubscricoesService(prisma, config)
  })

  it('rejects unknown plan for orgType', async () => {
    await expect(
      service.criarCheckout('p1', OrgType.POLITICIAN, 'UNKNOWN_PLAN', 'pol@votz.app'),
    ).rejects.toThrow(BadRequestException)
  })

  it('creates Stripe customer when missing and starts subscription checkout', async () => {
    prisma.politician.findUnique.mockResolvedValue({ stripeCustomerId: null })
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_123' })
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/s1' })

    const res = await service.criarCheckout('p1', OrgType.POLITICIAN, 'MANDATO_PRO', 'pol@votz.app')

    expect(stripeMock.customers.create).toHaveBeenCalledWith({
      email: 'pol@votz.app',
      metadata: { orgId: 'p1', orgType: OrgType.POLITICIAN },
    })
    expect(prisma.politician.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stripeCustomerId: 'cus_123' },
    })
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        mode: 'subscription',
        line_items: [{ price: 'price_pol_pro', quantity: 1 }],
      }),
    )
    expect(res).toEqual({ url: 'https://checkout.stripe.com/s1' })
  })

  it('uses subscription mode for MANDATO and rejects removed CAMPANHA plan', async () => {
    prisma.politician.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_existing' })
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/s2' })

    await service.criarCheckout('p1', OrgType.POLITICIAN, 'MANDATO', 'pol@votz.app')

    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_existing',
        mode: 'subscription',
        subscription_data: { metadata: { orgId: 'p1', orgType: OrgType.POLITICIAN, plan: 'MANDATO' } },
      }),
    )

    await expect(
      service.criarCheckout('p1', OrgType.POLITICIAN, 'CAMPANHA', 'pol@votz.app'),
    ).rejects.toThrow(BadRequestException)
  })

  it('throws NotFoundException in criarPortal when org has no stripeCustomerId', async () => {
    prisma.entity.findUnique.mockResolvedValue({ stripeCustomerId: null })
    await expect(service.criarPortal('e1', OrgType.ENTITY)).rejects.toThrow(NotFoundException)
  })

  it('handles checkout.session.completed and customer.subscription.deleted webhooks', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: 'sub_1',
          metadata: { orgId: 'e1', orgType: OrgType.ENTITY, plan: 'GESTAO' },
        },
      },
    })

    await service.handleWebhook(Buffer.from('{}'), 'sig')
    expect(prisma.stripeEvent.create).toHaveBeenCalledWith({
      data: { id: 'evt_checkout_1', type: 'checkout.session.completed' },
    })
    expect(prisma.entity.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { plan: 'GESTAO', stripeSubscriptionId: 'sub_1' },
    })

    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_sub_del_1',
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { orgId: 'c1', orgType: OrgType.COMPANY } } },
    })

    await service.handleWebhook(Buffer.from('{}'), 'sig')
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { plan: 'STARTER', stripeSubscriptionId: null },
    })
  })

  it('ignores duplicate Stripe event IDs idempotently and logs invoice failures without customer PII', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    prisma.stripeEvent.findUnique.mockResolvedValueOnce({ id: 'evt_dup_1' })
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_dup_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: 'sub_dup',
          metadata: { orgId: 'e1', orgType: OrgType.ENTITY, plan: 'GESTAO' },
        },
      },
    })

    const dupResult = await service.handleWebhook(Buffer.from('{}'), 'sig')
    expect(dupResult).toEqual({ received: true, duplicate: true })
    expect(prisma.entity.update).not.toHaveBeenCalled()

    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_fail_1',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_secret_pii_123' } },
    })

    const failResult = await service.handleWebhook(Buffer.from('{}'), 'sig')
    expect(failResult).toEqual({ received: true })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('evt_fail_1')
    expect(warnSpy.mock.calls[0][0]).not.toContain('cus_secret_pii_123')
    warnSpy.mockRestore()
  })

  it('throws NotFoundException when organization does not exist and never overwrites existing stripeCustomerId', async () => {
    prisma.entity.findUnique.mockResolvedValueOnce(null)
    await expect(
      service.criarCheckout('missing-e', OrgType.ENTITY, 'GESTAO', 'owner@votz.app'),
    ).rejects.toThrow(NotFoundException)
    expect(stripeMock.customers.create).not.toHaveBeenCalled()

    prisma.entity.findUnique.mockResolvedValueOnce(null)
    await expect(service.criarPortal('missing-e', OrgType.ENTITY)).rejects.toThrow(NotFoundException)

    prisma.entity.findUnique.mockResolvedValueOnce({ stripeCustomerId: 'cus_keep' })
    stripeMock.checkout.sessions.create.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/keep' })
    await service.criarCheckout('e1', OrgType.ENTITY, 'GESTAO', 'owner@votz.app')
    expect(stripeMock.customers.create).not.toHaveBeenCalled()
    expect(prisma.entity.update).not.toHaveBeenCalled()
  })
})
