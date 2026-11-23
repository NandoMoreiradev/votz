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
import { ConfigService } from '@nestjs/config'
import { AdsAiReviewService } from '../ads-ai-review/ads-ai-review.service'
import { AdsLandingService } from '../ads-landing/ads-landing.service'
import { MediaAssetsService } from '../../media/media-assets.service'
import { StorageService } from '../../storage/storage.service'
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
const creative = { id: 'cr1', accountId: 'acc1', headline: 'Pão quente', body: 'Entrega rápida', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.com.br', createdAt: now, updatedAt: now, media: [] }
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
const landing = { enqueue: jest.fn() }
const config = { get: jest.fn() }
const mediaAssets = {
  upload: jest.fn(),
  presign: jest.fn(),
  complete: jest.fn(),
  prepareForAdCreative: jest.fn(),
  attachToAdCreative: jest.fn(),
  afterAttach: jest.fn(),
  releaseForPost: jest.fn(),
}
const storage = { getPublicUrl: (key: string) => `https://cdn.test/${key}` }

const mediaRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'media-1', kind: 'IMAGE', status: 'READY', format: 'SQUARE', key: 'posts/m1.jpg', feedKey: 'posts/m1.feed.jpg', thumbKey: 'posts/m1.thumb.webp',
  posterKey: null, width: 1080, height: 1080, sourceWidth: 3000, sourceHeight: 3000, durationMs: null, legacy: false, ...overrides,
})
const prepared = { items: [{ id: 'media-1', kind: 'IMAGE', position: 0 }], media: [], mediaKeys: ['posts/m1.jpg'], renderedKeys: ['posts/m1.jpg'] }

describe('AdsCampaignsService', () => {
  let service: AdsCampaignsService

  beforeEach(async () => {
    jest.resetAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        AdsCampaignsService,
        { provide: AdsCampaignsRepository, useValue: repo },
        { provide: AdsAiReviewService, useValue: aiReview },
        { provide: MediaAssetsService, useValue: mediaAssets },
        { provide: StorageService, useValue: storage },
        { provide: AdsLandingService, useValue: landing },
        { provide: ConfigService, useValue: config },
      ],
    }).compile()
    service = module.get(AdsCampaignsService)
    aiReview.enqueue.mockResolvedValue(undefined)
    landing.enqueue.mockResolvedValue(undefined)
    config.get.mockReturnValue(undefined)
    mediaAssets.afterAttach.mockResolvedValue(undefined)
    mediaAssets.releaseForPost.mockResolvedValue(undefined)
  })

  describe('link do anúncio', () => {
    const withLink = (destinationUrl: string): CreateAdCampaignDto => ({ ...validCampaign(), creative: { ...validCampaign().creative, destinationUrl } })

    it.each(['https://bit.ly/abc', 'https://192.168.0.1/x', 'https://prefeitura.sp.gov.br/x', 'https://localhost/x'])('recusa %s antes de criar qualquer coisa', async (url) => {
      repo.findAccount.mockResolvedValue(account)
      await expect(service.createCampaign('co1', 'acc1', withLink(url), 'u1')).rejects.toBeInstanceOf(BadRequestException)
      expect(repo.createCampaign).not.toHaveBeenCalled()
      expect(mediaAssets.prepareForAdCreative).not.toHaveBeenCalled()
    })

    it('recusa domínio da lista do dono (ADS_BLOCKED_DOMAINS)', async () => {
      repo.findAccount.mockResolvedValue(account)
      config.get.mockImplementation((key: string) => (key === 'ADS_BLOCKED_DOMAINS' ? 'golpe.com.br' : undefined))
      await expect(service.createCampaign('co1', 'acc1', withLink('https://loja.golpe.com.br/x'), 'u1')).rejects.toThrow('não pode ser usado')
    })

    it('ao enviar para revisão, põe a conferência da página na fila junto com a da IA', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.createCampaign.mockResolvedValue(tree())
      await service.createCampaign('co1', 'acc1', { ...validCampaign(), submitForReview: true }, 'u1')
      expect(landing.enqueue).toHaveBeenCalledWith('ad1', 'SUBMIT')
      expect(aiReview.enqueue).toHaveBeenCalledWith('ad1')
    })

    it('como rascunho, não confere a página ainda', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.createCampaign.mockResolvedValue(tree())
      await service.createCampaign('co1', 'acc1', validCampaign(), 'u1')
      expect(landing.enqueue).not.toHaveBeenCalled()
    })
  })

  describe('foto e vídeo do anúncio', () => {
    const withMedia = (): CreateAdCampaignDto => ({
      ...validCampaign(),
      creative: { ...validCampaign().creative, media: { id: 'media-1', format: 'SQUARE' } },
    })
    const treeWithMedia = (media: unknown) => {
      const base = tree()
      base.adSets[0].ads[0].creative = { ...creative, media: media ? [media] : [] } as never
      return base
    }

    it('sem foto ou vídeo: não mexe no serviço de mídia e o anúncio é só texto', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.createCampaign.mockResolvedValue(tree())
      const view = await service.createCampaign('co1', 'acc1', validCampaign(), 'u1')
      expect(mediaAssets.prepareForAdCreative).not.toHaveBeenCalled()
      expect(repo.createCampaign.mock.calls[0][1]).toBeUndefined()
      expect(view.adSets[0].ads[0].creative.media).toBeNull()
    })

    it('prepara a mídia como de quem envia e liga ao criativo dentro da transação da campanha', async () => {
      repo.findAccount.mockResolvedValue(account)
      mediaAssets.prepareForAdCreative.mockResolvedValue(prepared)
      repo.createCampaign.mockResolvedValue(tree())
      repo.findCampaign.mockResolvedValue(treeWithMedia(mediaRow()))
      const view = await service.createCampaign('co1', 'acc1', withMedia(), 'u1')

      expect(mediaAssets.prepareForAdCreative).toHaveBeenCalledWith('u1', [{ id: 'media-1', format: 'SQUARE' }])
      // O 2º argumento do repositório é o "anexar": roda dentro da transação e liga ao criativo recém-criado.
      const tx = {}
      await repo.createCampaign.mock.calls[0][1](tx, 'cr1')
      expect(mediaAssets.attachToAdCreative).toHaveBeenCalledWith(tx, 'cr1', prepared)
      expect(mediaAssets.afterAttach).toHaveBeenCalledWith(prepared)
      expect(view.adSets[0].ads[0].creative.media).toMatchObject({ kind: 'IMAGE', status: 'READY', url: 'https://cdn.test/posts/m1.feed.jpg' })
    })

    it('mídia recusada (pequena demais, vídeo longo, de outra pessoa): a campanha nem é criada', async () => {
      repo.findAccount.mockResolvedValue(account)
      mediaAssets.prepareForAdCreative.mockRejectedValue(new BadRequestException('Essa foto é pequena demais para anúncio.'))
      await expect(service.createCampaign('co1', 'acc1', withMedia(), 'u1')).rejects.toThrow('pequena demais')
      expect(repo.createCampaign).not.toHaveBeenCalled()
    })

    it('se a campanha falhar ao salvar, os arquivos gerados são apagados e o envio fica livre', async () => {
      repo.findAccount.mockResolvedValue(account)
      mediaAssets.prepareForAdCreative.mockResolvedValue(prepared)
      repo.createCampaign.mockRejectedValue(new Error('banco fora'))
      await expect(service.createCampaign('co1', 'acc1', withMedia(), 'u1')).rejects.toThrow('banco fora')
      expect(mediaAssets.releaseForPost).toHaveBeenCalledWith(prepared)
      expect(mediaAssets.afterAttach).not.toHaveBeenCalled()
    })

    it('regras de conferência vêm antes: data no passado não gera nem prepara arquivo', async () => {
      repo.findAccount.mockResolvedValue(account)
      const past = withMedia()
      past.adSet.startAt = '2020-01-01'
      await expect(service.createCampaign('co1', 'acc1', past, 'u1')).rejects.toThrow('antes de hoje')
      expect(mediaAssets.prepareForAdCreative).not.toHaveBeenCalled()
    })

    it('vídeo preparando aparece como "PROCESSING" (sem endereço) para o anunciante', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.listCampaigns.mockResolvedValue([treeWithMedia(mediaRow({ kind: 'VIDEO', status: 'PROCESSING', key: null, feedKey: null, thumbKey: null }))])
      const [campaign] = await service.listCampaigns('co1', 'acc1')
      expect(campaign.adSets[0].ads[0].creative.media).toMatchObject({ kind: 'VIDEO', status: 'PROCESSING', url: null })
    })

    it('não deixa mandar para revisão anúncio cujo vídeo falhou', async () => {
      repo.findAd.mockResolvedValue({ ...ad('REJECTED'), creative: { ...creative, media: [mediaRow({ kind: 'VIDEO', status: 'FAILED' })] }, adSet: { campaign: { account: { companyId: 'co1' } } } })
      await expect(service.submitAd('co1', 'ad1')).rejects.toThrow('vídeo')
      expect(repo.submitAd).not.toHaveBeenCalled()
    })

    it('o envio do arquivo usa o propósito de anúncio', async () => {
      mediaAssets.upload.mockResolvedValue({ id: 'media-1' })
      mediaAssets.presign.mockResolvedValue({ id: 'media-2' })
      await service.uploadMedia('u1', Buffer.from('x'))
      await service.presignMedia('u1', { mimeType: 'video/mp4', sizeBytes: 10 })
      expect(mediaAssets.upload).toHaveBeenCalledWith('u1', expect.any(Buffer), 'AD_CREATIVE')
      expect(mediaAssets.presign).toHaveBeenCalledWith('u1', { mimeType: 'video/mp4', sizeBytes: 10 }, 'AD_CREATIVE')
    })
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
      await expect(service.createCampaign('co1', 'acc1', validCampaign(), 'u1')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('cria rascunho com textos limpos e cidades sem repetição', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.createCampaign.mockResolvedValue(tree())
      const dto = validCampaign()
      dto.adSet.cities = ['São Paulo', ' São Paulo ']
      await service.createCampaign('co1', 'acc1', dto, 'u1')
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
      await service.createCampaign('co1', 'acc1', dto, 'u1')
      const { adSet } = repo.createCampaign.mock.calls[0][0]
      expect(adSet).toEqual(expect.objectContaining({ interests: [], ageBands: [], genders: [], automaticAudience: true, states: ['SP'] }))
    })

    it('enviar para revisão já marca o anúncio como em revisão', async () => {
      repo.findAccount.mockResolvedValue(account)
      repo.createCampaign.mockResolvedValue(tree())
      await service.createCampaign('co1', 'acc1', { ...validCampaign(), submitForReview: true }, 'u1')
      expect(repo.createCampaign.mock.calls[0][0].ad).toEqual(expect.objectContaining({ reviewStatus: 'PENDING', submittedAt: expect.any(Date) }))
      expect(aiReview.enqueue).toHaveBeenCalledTimes(1)
    })

    it('recusa início no passado e fim antes do início', async () => {
      repo.findAccount.mockResolvedValue(account)
      const past = validCampaign()
      past.adSet.startAt = '2020-01-01'
      await expect(service.createCampaign('co1', 'acc1', past, 'u1')).rejects.toThrow('antes de hoje')
      const backwards = validCampaign()
      backwards.adSet.endAt = backwards.adSet.startAt
      await expect(service.createCampaign('co1', 'acc1', backwards, 'u1')).rejects.toThrow('depois da data de início')
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
