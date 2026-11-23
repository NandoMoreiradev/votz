import { BadRequestException, NotFoundException } from '@nestjs/common'

const stripeMock = {
  customers: { create: jest.fn() },
  checkout: { sessions: { create: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
  webhooks: { constructEvent: jest.fn() },
}

jest.mock('stripe', () => jest.fn(() => stripeMock))

import { SubscricoesService } from './subscricoes.service'

/** Plano Imprensa Pro: checkout, portal e webhook (ramo `pressCredentialId`, separado das organizações). */
describe('SubscricoesService — imprensa', () => {
  let service: SubscricoesService
  let prisma: any

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.STRIPE_PRESS_PRO_PRICE_ID = 'price_press_pro'
    prisma = {
      pressCredential: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      entity: { update: jest.fn() },
      stripeEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    }
    const config = {
      getOrThrow: jest.fn((k: string) => {
        if (k === 'STRIPE_SECRET_KEY') return 'sk_test_123'
        if (k === 'WEB_URL') return 'http://localhost:5173'
        if (k === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test'
        throw new Error(k)
      }),
    }
    service = new SubscricoesService(prisma, config as any)
  })

  afterAll(() => {
    delete process.env.STRIPE_PRESS_PRO_PRICE_ID
  })

  it('sem preço configurado, o checkout diz que o plano ainda não está à venda', async () => {
    delete process.env.STRIPE_PRESS_PRO_PRICE_ID
    await expect(service.criarCheckoutImprensa('u1', 'a@x.test')).rejects.toThrow(/ainda não está à venda/)
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('cria o cliente no Stripe uma vez, guarda o id e abre a assinatura com a credencial nos metadados', async () => {
    prisma.pressCredential.findFirst.mockResolvedValue({ id: 'c1', plan: 'GRATUITA', stripeCustomerId: null })
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_press' })
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/p' })

    await expect(service.criarCheckoutImprensa('u1', 'a@x.test')).resolves.toEqual({ url: 'https://checkout.stripe.test/p' })

    expect(stripeMock.customers.create).toHaveBeenCalledWith({ email: 'a@x.test', metadata: { pressCredentialId: 'c1' } })
    expect(prisma.pressCredential.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { stripeCustomerId: 'cus_press' } })
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_press',
        mode: 'subscription',
        line_items: [{ price: 'price_press_pro', quantity: 1 }],
        success_url: 'http://localhost:5173/imprensa?plano=ok',
        metadata: { pressCredentialId: 'c1', plan: 'PRO' },
        subscription_data: { metadata: { pressCredentialId: 'c1', plan: 'PRO' } },
      }),
    )
  })

  it('reaproveita o cliente existente e não deixa assinar quem já é Pro', async () => {
    prisma.pressCredential.findFirst.mockResolvedValueOnce({ id: 'c1', plan: 'GRATUITA', stripeCustomerId: 'cus_keep' })
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'u' })
    await service.criarCheckoutImprensa('u1', 'a@x.test')
    expect(stripeMock.customers.create).not.toHaveBeenCalled()

    prisma.pressCredential.findFirst.mockResolvedValueOnce({ id: 'c1', plan: 'PRO', stripeCustomerId: 'cus_keep' })
    await expect(service.criarCheckoutImprensa('u1', 'a@x.test')).rejects.toThrow(BadRequestException)

    prisma.pressCredential.findFirst.mockResolvedValueOnce(null)
    await expect(service.criarCheckoutImprensa('u1', 'a@x.test')).rejects.toThrow(NotFoundException)
  })

  it('portal: precisa de assinatura (cliente no Stripe)', async () => {
    prisma.pressCredential.findFirst.mockResolvedValueOnce({ id: 'c1', plan: 'PRO', stripeCustomerId: null })
    await expect(service.criarPortalImprensa('u1')).rejects.toThrow(NotFoundException)

    prisma.pressCredential.findFirst.mockResolvedValueOnce({ id: 'c1', plan: 'PRO', stripeCustomerId: 'cus_1' })
    stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: 'https://portal.stripe.test' })
    await expect(service.criarPortalImprensa('u1')).resolves.toEqual({ url: 'https://portal.stripe.test' })
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'http://localhost:5173/imprensa',
    })
  })

  it('webhook: checkout concluído liga o Pro na credencial (e não toca em organização)', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_press_1',
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', subscription: 'sub_press', metadata: { pressCredentialId: 'c1', plan: 'PRO' } } },
    })
    await service.handleWebhook(Buffer.from('{}'), 'sig')
    expect(prisma.pressCredential.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'APPROVED' },
      data: { plan: 'PRO', stripeSubscriptionId: 'sub_press' },
    })
    expect(prisma.entity.update).not.toHaveBeenCalled()
  })

  it('webhook: assinatura ativa mantém o Pro; cancelada ou sem pagamento volta ao gratuito; outros estados não mexem', async () => {
    const ev = (id: string, status: string) => ({
      id,
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_press', status, metadata: { pressCredentialId: 'c1', plan: 'PRO' } } },
    })

    stripeMock.webhooks.constructEvent.mockReturnValueOnce(ev('evt_a', 'active'))
    await service.handleWebhook(Buffer.from('{}'), 'sig')
    expect(prisma.pressCredential.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'c1', status: 'APPROVED' },
      data: { plan: 'PRO', stripeSubscriptionId: 'sub_press' },
    })

    stripeMock.webhooks.constructEvent.mockReturnValueOnce(ev('evt_b', 'unpaid'))
    await service.handleWebhook(Buffer.from('{}'), 'sig')
    expect(prisma.pressCredential.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'c1' },
      data: { plan: 'GRATUITA', stripeSubscriptionId: null },
    })

    prisma.pressCredential.updateMany.mockClear()
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(ev('evt_c', 'past_due'))
    await service.handleWebhook(Buffer.from('{}'), 'sig')
    expect(prisma.pressCredential.updateMany).not.toHaveBeenCalled()
  })

  it('webhook: assinatura apagada volta ao gratuito', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_del',
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { pressCredentialId: 'c1' } } },
    })
    await service.handleWebhook(Buffer.from('{}'), 'sig')
    expect(prisma.pressCredential.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { plan: 'GRATUITA', stripeSubscriptionId: null },
    })
  })
})
