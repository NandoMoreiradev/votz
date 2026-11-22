// jsdom não carrega no Jest; o mesmo efeito do sanitize com tags proibidas: tira script com conteúdo e as tags.
jest.mock('isomorphic-dompurify', () => {
  const sanitize = (v: string) => v.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '')
  return { __esModule: true, default: { sanitize }, sanitize }
})

import { Test } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AdsCampaignsService, MAX_AD_ACCOUNTS_PER_COMPANY } from './ads-campaigns.service'
import { AdsAiReviewService } from '../ads-ai-review/ads-ai-review.service'
import { AdsCampaignsRepository } from './ads-campaigns.repository'
import { CreateAdCampaignDto } from './dto/ads-campaigns.dto'

const repo = {
  findCompany: jest.fn(),
  listAccounts: jest.fn(),
  countAccounts: jest.fn(),
  createAccount: jest.fn(),
  findAccount: jest.fn(),
  listCampaigns: jest.fn(),
  findCampaign: jest.fn(),
  createCampaign: jest.fn(),
  setCampaignStatus: jest.fn(),
  findAd: jest.fn(),
  submitAd: jest.fn(),
}

const now = new Date('2026-11-21T15:00:00Z')
const account = { id: 'acc1', companyId: 'co1', name: 'Conta', currency: 'BRL', timezone: 'America/Sao_Paulo', balanceCents: 0, createdById: 'u1', createdAt: now, updatedAt: now }
const creative = { id: 'cr1', accountId: 'acc1', headline: 'Pão quente', body: 'Entrega rápida', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.com.br', createdAt: now, updatedAt: now }
const ad = (reviewStatus: string) => ({ id: 'ad1', adSetId: 'set1', creativeId: 'cr1', name: 'Pão quente', status: 'DRAFT', reviewStatus, reviewNote: null, submittedAt: null, reviewedAt: null, createdAt: now, updatedAt: now, creative })
const tree = (overrides: Record<string, unknown> = {}, reviewStatus = 'NOT_SUBMITTED') => ({
  id: 'camp1', accountId: 'acc1', name: 'Dezembro', objective: 'TRAFFIC', status: 'DRAFT', createdAt: now, updatedAt: now,
  adSets: [{
    id: 'set1', campaignId: 'camp1', name: 'Centro', status: 'DRAFT', dailyBudgetCents: 2000, bidCapCents: null,
    startAt: now, endAt: null, states: ['SP'], cities: [], interests: ['food-drink'], ageBands: [], genders: [],
    automaticAudience: false, createdAt: now, updatedAt: now, ads: [ad(reviewStatus)],
  }],
  ...overrides,
})

const tomorrow = () => new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
const validCampaign = (): CreateAdCampaignDto => ({
  name: 'Dezembro <b>quente</b>',
  objective: 'TRAFFIC',
  adSet: {
    name: 'Centro', dailyBudgetCents: 2000, startAt: tomorrow(), states: ['SP'], cities: ['São Paulo'],
    interests: ['food-drink'], ageBands: ['25-34'], genders: ['FEMALE'], automaticAudience: false,
  },
  creative: { headline: 'Pão quente às 7h', body: 'Padaria do bairro <script>x</script>', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.com.br' },
})

const aiReview = { enqueue: jest.fn() }


describe('AdsCampaignsService', () => {
  let service: AdsCampaignsService

  beforeEach(async () => {
    jest.resetAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        AdsCampaignsService,
        { provide: AdsCampaignsRepository, useValue: repo },
        { provide: AdsAiReviewService, useValue: aiReview },
      ],
    }).compile()
    service = module.get(AdsCampaignsService)
    aiReview.enqueue.mockResolvedValue(undefined)
  })

  describe('contas', () => {
    it('empresa não verificada não pode criar conta', async () => {
      repo.findCompany.mockResolvedValue({ id: 'co1', verified: false })
      await expect(service.createAccount('co1', 'u1', 'Conta')).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.createAccount).not.toHaveBeenCalled()
    })

    it(`limite de ${MAX_AD_ACCOUNTS_PER_COMPANY} contas por empresa`, async () => {
      repo.findCompany.mockResolvedValue({ id: 'co1', verified: true })
      repo.countAccounts.mockResolvedValue(MAX_AD_ACCOUNTS_PER_COMPANY)
      await expect(service.createAccount('co1', 'u1', 'Conta')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('empresa verificada cria conta com nome limpo', async () => {
      repo.findCompany.mockResolvedValue({ id: 'co1', verified: true })
      repo.countAccounts.mockResolvedValue(0)
      repo.createAccount.mockResolvedValue(account)
      const view = await service.createAccount('co1', 'u1', '  Conta <i>principal</i> ')
      expect(repo.createAccount).toHaveBeenCalledWith('co1', 'Conta principal', 'u1')
      expect(view).toEqual(expect.objectContaining({ id: 'acc1', balanceCents: 0, currency: 'BRL' }))
    })
  })

  describe('campanhas', () => {
    it('conta de outra empresa: não encontrada', async () => {
      repo.findAccount.mockResolvedValue({ ...account, companyId: 'outra' })
      await expect(service.listCampaigns('co1', 'acc1')).rejects.toBeInstanceOf(NotFoundException)
      await expect(service.createCampaign('co1', 'acc1', validCampaign())).rejects.toBeInstanceOf(NotFoundException)
    })

    it('cria rascunho com textos limpos e cidades sem repetição', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.createCampaign.mockResolvedValue(tree())
      const dto = validCampaign()
      dto.adSet.cities = ['São Paulo', ' São Paulo ']
      await service.createCampaign('co1', 'acc1', dto)
      const data = repo.createCampaign.mock.calls[0][0]
      expect(data.name).toBe('Dezembro quente')
      expect(data.creative.body).toBe('Padaria do bairro')
      expect(data.adSet.cities).toEqual(['São Paulo'])
      expect(data.ad).toEqual({ name: 'Pão quente às 7h', reviewStatus: 'NOT_SUBMITTED', submittedAt: null })
    })

    it('público automático ignora interesses, idade e gênero', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.createCampaign.mockResolvedValue(tree())
      const dto = validCampaign()
      dto.adSet.automaticAudience = true
      await service.createCampaign('co1', 'acc1', dto)
      const { adSet } = repo.createCampaign.mock.calls[0][0]
      expect(adSet).toEqual(expect.objectContaining({ interests: [], ageBands: [], genders: [], automaticAudience: true, states: ['SP'] }))
    })

    it('enviar para revisão já marca o anúncio como em revisão', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.createCampaign.mockResolvedValue(tree())
      await service.createCampaign('co1', 'acc1', { ...validCampaign(), submitForReview: true })
      expect(repo.createCampaign.mock.calls[0][0].ad).toEqual(expect.objectContaining({ reviewStatus: 'PENDING', submittedAt: expect.any(Date) }))
      expect(aiReview.enqueue).toHaveBeenCalledTimes(1)
    })

    it('recusa início no passado e fim antes do início', async () => {
      repo.findAccount.mockResolvedValue(account)
      const past = validCampaign()
      past.adSet.startAt = '2020-01-01'
      await expect(service.createCampaign('co1', 'acc1', past)).rejects.toThrow('antes de hoje')
      const backwards = validCampaign()
      backwards.adSet.endAt = backwards.adSet.startAt
      await expect(service.createCampaign('co1', 'acc1', backwards)).rejects.toThrow('depois da data de início')
      expect(repo.createCampaign).not.toHaveBeenCalled()
    })

    it('devolve os três níveis: campanha → conjunto → anúncio com criativo', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.listCampaigns.mockResolvedValue([tree()])
      const [campaign] = await service.listCampaigns('co1', 'acc1')
      expect(campaign.adSets[0].ads[0].creative.destinationUrl).toBe('https://padaria.com.br')
      expect(campaign.adSets[0].startAt).toBe(now.toISOString())
    })
  })

  describe('ligar, pausar e arquivar', () => {
    const withAccount = (overrides = {}, reviewStatus = 'NOT_SUBMITTED', balanceCents = 0) =>
      ({ ...tree(overrides, reviewStatus), account: { id: 'acc1', companyId: 'co1', balanceCents } })

    it('ligar sem anúncio aprovado: recusa', async () => {
      repo.findCampaign.mockResolvedValue(withAccount({}, 'PENDING', 5000))
      await expect(service.setCampaignStatus('co1', 'camp1', { status: 'ACTIVE' })).rejects.toThrow('aprovado')
    })

    it('ligar sem saldo: recusa', async () => {
      repo.findCampaign.mockResolvedValue(withAccount({}, 'APPROVED', 0))
      await expect(service.setCampaignStatus('co1', 'camp1', { status: 'ACTIVE' })).rejects.toThrow('saldo')
    })

    it('ligar com anúncio aprovado e saldo: liga', async () => {
      repo.findCampaign.mockResolvedValue(withAccount({}, 'APPROVED', 5000))
      repo.setCampaignStatus.mockResolvedValue(tree({ status: 'ACTIVE' }, 'APPROVED'))
      await expect(service.setCampaignStatus('co1', 'camp1', { status: 'ACTIVE' })).resolves.toEqual(expect.objectContaining({ status: 'ACTIVE' }))
    })

    it('pausar sempre pode; arquivada não volta', async () => {
      repo.findCampaign.mockResolvedValue(withAccount({ status: 'ACTIVE' }))
      repo.setCampaignStatus.mockResolvedValue(tree({ status: 'PAUSED' }))
      await expect(service.setCampaignStatus('co1', 'camp1', { status: 'PAUSED' })).resolves.toEqual(expect.objectContaining({ status: 'PAUSED' }))
      repo.findCampaign.mockResolvedValue(withAccount({ status: 'ARCHIVED' }))
      await expect(service.setCampaignStatus('co1', 'camp1', { status: 'PAUSED' })).rejects.toBeInstanceOf(BadRequestException)
    })

    it('campanha de outra empresa: não encontrada', async () => {
      repo.findCampaign.mockResolvedValue({ ...withAccount(), account: { id: 'acc1', companyId: 'outra', balanceCents: 0 } })
      await expect(service.setCampaignStatus('co1', 'camp1', { status: 'PAUSED' })).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('revisão', () => {
    const owned = (reviewStatus: string, companyId = 'co1') => ({ ...ad(reviewStatus), adSet: { campaign: { account: { companyId } } } })

    it('manda para revisão o rascunho e o recusado', async () => {
      repo.findAd.mockResolvedValue(owned('REJECTED'))
      repo.submitAd.mockResolvedValue(ad('PENDING'))
      await expect(service.submitAd('co1', 'ad1')).resolves.toEqual(expect.objectContaining({ reviewStatus: 'PENDING' }))
      expect(aiReview.enqueue).toHaveBeenCalledWith('ad1')
    })

    it('não reenvia o que já está em revisão ou aprovado; não mexe em anúncio de outra empresa', async () => {
      repo.findAd.mockResolvedValue(owned('PENDING'))
      await expect(service.submitAd('co1', 'ad1')).rejects.toBeInstanceOf(BadRequestException)
      repo.findAd.mockResolvedValue(owned('APPROVED'))
      await expect(service.submitAd('co1', 'ad1')).rejects.toBeInstanceOf(BadRequestException)
      repo.findAd.mockResolvedValue(owned('NOT_SUBMITTED', 'outra'))
      await expect(service.submitAd('co1', 'ad1')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})

describe('CreateAdCampaignDto', () => {
  const check = (body: object) => validate(plainToInstance(CreateAdCampaignDto, body))
  const errorsOf = async (mutate: (dto: ReturnType<typeof validCampaign>) => void) => {
    const dto = validCampaign()
    mutate(dto)
    return (await check(dto)).length
  }

  it('aceita a campanha válida', async () => {
    expect(await check(validCampaign())).toHaveLength(0)
  })

  it('segmentação só com sinais permitidos: recusa interesse sensível, faixa e gênero fora da lista', async () => {
    expect(await errorsOf((d) => { d.adSet.interests = ['politics' as never] })).toBeGreaterThan(0)
    expect(await errorsOf((d) => { d.adSet.interests = ['health' as never] })).toBeGreaterThan(0)
    expect(await errorsOf((d) => { d.adSet.ageBands = ['13-17' as never] })).toBeGreaterThan(0)
    expect(await errorsOf((d) => { d.adSet.genders = ['X' as never] })).toBeGreaterThan(0)
  })

  it('link só https; orçamento mínimo de R$ 6; botão só da lista', async () => {
    expect(await errorsOf((d) => { d.creative.destinationUrl = 'http://padaria.com.br' })).toBeGreaterThan(0)
    expect(await errorsOf((d) => { d.creative.destinationUrl = 'javascript:alert(1)' })).toBeGreaterThan(0)
    expect(await errorsOf((d) => { d.adSet.dailyBudgetCents = 599 })).toBeGreaterThan(0)
    expect(await errorsOf((d) => { d.creative.ctaLabel = 'Clique aqui agora!!!' as never })).toBeGreaterThan(0)
  })

  it('estado só pela sigla', async () => {
    expect(await errorsOf((d) => { d.adSet.states = ['São Paulo'] })).toBeGreaterThan(0)
  })
})
