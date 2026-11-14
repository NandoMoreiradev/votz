import { BadRequestException, NotFoundException } from '@nestjs/common'
import { OrgType } from '@prisma/client'

process.env.STRIPE_POLITICIAN_PRO_PRICE_ID = 'price_pol_pro'
process.env.STRIPE_POLITICIAN_CAMPANHA_PRICE_ID = 'price_pol_camp'
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

    const res = await service.criarCheckout('p1', OrgType.POLITICIAN, 'MANDATOMETRO_PRO', 'pol@votz.app')

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

  it('uses payment mode for CAMPANHA one-time plan', async () => {
    prisma.politician.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_existing' })
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/s2' })

    await service.criarCheckout('p1', OrgType.POLITICIAN, 'CAMPANHA', 'pol@votz.app')

    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_existing',
        mode: 'payment',
        payment_intent_data: { metadata: { orgId: 'p1', orgType: OrgType.POLITICIAN, plan: 'CAMPANHA' } },
      }),
    )
  })

  it('throws NotFoundException in criarPortal when org has no stripeCustomerId', async () => {
    prisma.entity.findUnique.mockResolvedValue({ stripeCustomerId: null })
    await expect(service.criarPortal('e1', OrgType.ENTITY)).rejects.toThrow(NotFoundException)
  })

  it('handles checkout.session.completed and customer.subscription.deleted webhooks', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
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
    expect(prisma.entity.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { plan: 'GESTAO', stripeSubscriptionId: 'sub_1' },
    })

    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { orgId: 'c1', orgType: OrgType.COMPANY } } },
    })

    await service.handleWebhook(Buffer.from('{}'), 'sig')
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { plan: 'STARTER', stripeSubscriptionId: null },
    })
  })
})
