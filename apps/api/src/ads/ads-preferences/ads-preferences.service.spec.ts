import { Test } from '@nestjs/testing'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AD_PERSONALIZATION_CONSENT_VERSION } from '@votz/shared-types'
import { AdsPreferencesService } from './ads-preferences.service'
import { AdsPreferencesRepository } from './ads-preferences.repository'
import { UpdateAdPreferencesDto } from './dto/update-ad-preferences.dto'

const repo = { findPreference: jest.fn(), findDemographics: jest.fn(), upsert: jest.fn() }

describe('AdsPreferencesService', () => {
  let service: AdsPreferencesService

  beforeEach(async () => {
    jest.resetAllMocks()
    const module = await Test.createTestingModule({
      providers: [AdsPreferencesService, { provide: AdsPreferencesRepository, useValue: repo }],
    }).compile()
    service = module.get(AdsPreferencesService)
    repo.findDemographics.mockResolvedValue({ birthDate: null, gender: null })
  })

  it('sem registro: personalização desligada e nenhum interesse (opt-in)', async () => {
    repo.findPreference.mockResolvedValue(null)
    await expect(service.get('u1')).resolves.toEqual({ personalizationConsent: false, consentAt: null, interests: [], ageBand: null, gender: null })
  })

  it('devolve só a faixa de idade, nunca a data de nascimento', async () => {
    repo.findPreference.mockResolvedValue(null)
    repo.findDemographics.mockResolvedValue({ birthDate: new Date('1990-01-01T00:00:00Z'), gender: 'FEMALE' })
    const view = await service.get('u1')
    expect(view.ageBand).toBe('35-44')
    expect(view.gender).toBe('FEMALE')
    expect(JSON.stringify(view)).not.toContain('1990')
  })

  it('ignora interesse que não está mais na lista permitida', async () => {
    repo.findPreference.mockResolvedValue({ personalizationConsent: true, consentAt: new Date(), interests: ['sports', 'politics'] })
    expect((await service.get('u1')).interests).toEqual(['sports'])
  })

  it('ligar a personalização registra data e versão do aceite', async () => {
    repo.findPreference.mockResolvedValue(null)
    await service.update('u1', { personalizationConsent: true })
    expect(repo.upsert).toHaveBeenCalledWith('u1', expect.objectContaining({
      personalizationConsent: true,
      consentAt: expect.any(Date),
      consentVersion: AD_PERSONALIZATION_CONSENT_VERSION,
    }))
  })

  it('já ligada: salvar de novo não troca a data do aceite', async () => {
    repo.findPreference.mockResolvedValue({ personalizationConsent: true, consentAt: new Date('2026-11-01'), interests: [] })
    await service.update('u1', { personalizationConsent: true })
    expect(repo.upsert.mock.calls[0][1]).toEqual({ personalizationConsent: true })
  })

  it('desligar apaga a data do aceite e mantém os interesses', async () => {
    repo.findPreference.mockResolvedValue({ personalizationConsent: true, consentAt: new Date(), interests: ['sports'] })
    await service.update('u1', { personalizationConsent: false })
    expect(repo.upsert).toHaveBeenCalledWith('u1', { personalizationConsent: false, consentAt: null, consentVersion: null })
  })

  it('só interesses: não mexe no aceite; repetidos são juntados; lista vazia apaga todos', async () => {
    repo.findPreference.mockResolvedValue(null)
    await service.update('u1', { interests: ['sports', 'sports', 'music'] })
    expect(repo.upsert).toHaveBeenLastCalledWith('u1', { interests: ['sports', 'music'] })
    await service.update('u1', { interests: [] })
    expect(repo.upsert).toHaveBeenLastCalledWith('u1', { interests: [] })
  })

  it('corpo vazio não grava nada', async () => {
    repo.findPreference.mockResolvedValue(null)
    await service.update('u1', {})
    expect(repo.upsert).not.toHaveBeenCalled()
  })
})

describe('UpdateAdPreferencesDto', () => {
  const check = (body: object) => validate(plainToInstance(UpdateAdPreferencesDto, body))

  it('aceita interesses da lista e recusa tema sensível', async () => {
    expect(await check({ interests: ['sports', 'music'], personalizationConsent: true })).toHaveLength(0)
    expect((await check({ interests: ['politics'] })).length).toBeGreaterThan(0)
    expect((await check({ interests: ['religion'] })).length).toBeGreaterThan(0)
  })

  it('recusa mais de 10 interesses e repetidos', async () => {
    const eleven = ['local-commerce', 'local-services', 'shopping', 'food-drink', 'events', 'arts-culture', 'music', 'movies-tv', 'books', 'games', 'travel']
    expect((await check({ interests: eleven })).length).toBeGreaterThan(0)
    expect((await check({ interests: ['sports', 'sports'] })).length).toBeGreaterThan(0)
  })

  it('personalizationConsent precisa ser verdadeiro ou falso', async () => {
    expect((await check({ personalizationConsent: 'sim' })).length).toBeGreaterThan(0)
  })
})
