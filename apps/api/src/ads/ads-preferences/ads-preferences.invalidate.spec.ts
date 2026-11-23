import { AdsPreferencesService } from './ads-preferences.service'

const repo = { findPreference: jest.fn(), findDemographics: jest.fn(), upsert: jest.fn() }
const cache = { invalidate: jest.fn().mockResolvedValue(undefined) }

describe('preferências de anúncios apagam a cópia do cadastro da entrega', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    repo.findPreference.mockResolvedValue({ personalizationConsent: true, consentAt: new Date(), interests: [] })
    repo.findDemographics.mockResolvedValue({ birthDate: null, gender: null })
  })

  it('retirar o aceite grava e depois apaga a cópia', async () => {
    const order: string[] = []
    repo.upsert.mockImplementation(async () => void order.push('gravou'))
    cache.invalidate.mockImplementation(async () => void order.push('apagou'))
    await new AdsPreferencesService(repo as never, cache as never).update('u1', { personalizationConsent: false })
    expect(order).toEqual(['gravou', 'apagou'])
    expect(cache.invalidate).toHaveBeenCalledWith('u1')
  })

  it('mudar os interesses também apaga', async () => {
    await new AdsPreferencesService(repo as never, cache as never).update('u1', { interests: ['sports'] as never })
    expect(cache.invalidate).toHaveBeenCalledWith('u1')
  })

  it('pedido que não muda nada não apaga', async () => {
    await new AdsPreferencesService(repo as never, cache as never).update('u1', {})
    expect(cache.invalidate).not.toHaveBeenCalled()
  })

  it('sem a cópia (sem Redis), segue normal', async () => {
    await expect(new AdsPreferencesService(repo as never).update('u1', { personalizationConsent: false })).resolves.toBeDefined()
  })
})
