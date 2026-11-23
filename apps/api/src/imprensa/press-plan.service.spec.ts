import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { PRESS_PLAN_LIMITS } from '@votz/shared-types'

jest.mock('stripe', () => jest.fn(() => ({})))

import { PressPlanService } from './press-plan.service'

const access = { require: jest.fn() }
const repo = { findForPlan: jest.fn(), setPlan: jest.fn() }
const billing = { criarCheckoutImprensa: jest.fn(), criarPortalImprensa: jest.fn() }

describe('PressPlanService', () => {
  let service: PressPlanService

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.STRIPE_PRESS_PRO_PRICE_ID
    access.require.mockResolvedValue({
      plan: 'GRATUITA', limits: PRESS_PLAN_LIMITS.GRATUITA, credentialId: 'c1', stripeCustomerId: null, stripeSubscriptionId: null,
    })
    service = new PressPlanService(access as any, repo as any, billing as any)
  })

  it('informa o plano, os limites e se o checkout está disponível (só com preço do Stripe)', async () => {
    let info = await service.getInfo('u1')
    expect(info).toMatchObject({ plan: 'GRATUITA', checkoutAvailable: false, hasSubscription: false })
    expect(info.limits.maxRadarRules).toBe(2)
    expect(info.supportEmail).toContain('@')

    process.env.STRIPE_PRESS_PRO_PRICE_ID = 'price_press_pro'
    info = await service.getInfo('u1')
    expect(info.checkoutAvailable).toBe(true)
  })

  it('checkout e portal só para imprensa aprovada', async () => {
    billing.criarCheckoutImprensa.mockResolvedValue({ url: 'https://stripe.test/x' })
    await expect(service.checkout('u1', 'a@x.test')).resolves.toEqual({ url: 'https://stripe.test/x' })
    expect(billing.criarCheckoutImprensa).toHaveBeenCalledWith('u1', 'a@x.test')

    access.require.mockRejectedValue(new Error('forbidden'))
    await expect(service.checkout('u1', 'a@x.test')).rejects.toThrow('forbidden')
    await expect(service.portal('u1')).rejects.toThrow('forbidden')
  })

  describe('troca manual pela equipe', () => {
    const approved = { id: 'c1', userId: 'u1', status: 'APPROVED', plan: 'GRATUITA', outletName: 'Gazeta' }

    it('troca para Pro com motivo e grava "GRATUITA → PRO" na auditoria', async () => {
      repo.findForPlan.mockResolvedValue(approved)
      repo.setPlan.mockResolvedValue(true)
      await expect(service.setPlanByStaff('c1', 'PRO', 'adm', 'Piloto combinado com a redação.')).resolves.toEqual({ id: 'c1', plan: 'PRO' })
      expect(repo.setPlan).toHaveBeenCalledWith('c1', 'u1', 'PRO', 'adm', 'GRATUITA → PRO: Piloto combinado com a redação.')
    })

    it('recusa plano inválido, motivo curto, credencial inexistente, não aprovada ou já no plano', async () => {
      await expect(service.setPlanByStaff('c1', 'GOLD', 'adm', 'Motivo suficiente aqui.')).rejects.toThrow(BadRequestException)
      await expect(service.setPlanByStaff('c1', 'PRO', 'adm', 'curto')).rejects.toThrow(BadRequestException)

      repo.findForPlan.mockResolvedValueOnce(null)
      await expect(service.setPlanByStaff('c1', 'PRO', 'adm', 'Motivo suficiente aqui.')).rejects.toThrow(NotFoundException)

      repo.findForPlan.mockResolvedValueOnce({ ...approved, status: 'PENDING' })
      await expect(service.setPlanByStaff('c1', 'PRO', 'adm', 'Motivo suficiente aqui.')).rejects.toThrow(ConflictException)

      repo.findForPlan.mockResolvedValueOnce({ ...approved, plan: 'PRO' })
      await expect(service.setPlanByStaff('c1', 'PRO', 'adm', 'Motivo suficiente aqui.')).rejects.toThrow(ConflictException)
      expect(repo.setPlan).not.toHaveBeenCalled()
    })

    it('se a credencial deixou de estar aprovada no meio da troca, dá conflito', async () => {
      repo.findForPlan.mockResolvedValue(approved)
      repo.setPlan.mockResolvedValue(false)
      await expect(service.setPlanByStaff('c1', 'PRO', 'adm', 'Motivo suficiente aqui.')).rejects.toThrow(ConflictException)
    })
  })
})
