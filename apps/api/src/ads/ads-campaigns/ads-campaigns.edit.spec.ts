// jsdom não carrega no Jest; o mesmo efeito do sanitize com tags proibidas: tira script com conteúdo e as tags.
jest.mock('isomorphic-dompurify', () => {
  const sanitize = (v: string) => v.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '')
  return { __esModule: true, default: { sanitize }, sanitize }
})

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { AdsCampaignsService } from './ads-campaigns.service'
import type { UpdateAdDto, UpdateAdSetDto } from './dto/ads-campaigns.dto'

const now = new Date('2026-11-22T15:00:00Z')

const creative = (patch: Record<string, unknown> = {}) => ({
  id: 'cr1', accountId: 'acc1', headline: 'Pão quente', body: 'Entrega rápida', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.com.br', createdAt: now, updatedAt: now, media: null, ...patch,
})
const adRow = (reviewStatus = 'APPROVED', campaignStatus = 'ACTIVE', companyId = 'co1') => ({
  id: 'ad1', adSetId: 'set1', creativeId: 'cr1', name: 'Pão quente', status: 'DRAFT', reviewStatus, reviewNote: null, submittedAt: now, reviewedAt: now, createdAt: now, updatedAt: now,
  creative: creative(),
  adSet: { campaign: { id: 'camp1', status: campaignStatus, account: { companyId } } },
})
const setRow = (patch: Record<string, unknown> = {}, campaignStatus = 'ACTIVE', companyId = 'co1') => ({
  id: 'set1', campaignId: 'camp1', name: 'Centro', status: 'ACTIVE', dailyBudgetCents: 2000, bidCapCents: null,
  startAt: new Date('2026-11-20T03:00:00Z'), endAt: null, states: ['SP'], cities: [], interests: ['food-drink'], ageBands: ['25-34'], genders: ['FEMALE'],
  automaticAudience: false, createdAt: now, updatedAt: now,
  campaign: { id: 'camp1', status: campaignStatus, account: { companyId } },
  ...patch,
})
const tree = (patch: Record<string, unknown> = {}) => ({
  id: 'camp1', accountId: 'acc1', name: 'Dezembro', objective: 'TRAFFIC', status: 'ACTIVE', createdAt: now, updatedAt: now,
  account: { id: 'acc1', companyId: 'co1', balanceCents: 5000 },
  adSets: [{ ...setRow(), ads: [{ ...adRow(), creative: creative() }] }],
  ...patch,
})

const repo = {
  findAdForEdit: jest.fn(),
  updateAd: jest.fn(),
  findAdSetForEdit: jest.fn(),
  updateAdSet: jest.fn(),
  findCampaign: jest.fn(),
  duplicateCampaign: jest.fn(),
  findAd: jest.fn(),
  submitAd: jest.fn(),
}
const aiReview = { enqueue: jest.fn() }
const mediaAssets = {
  prepareForAdCreative: jest.fn(),
  attachToAdCreative: jest.fn(),
  removeAdCreativeMedia: jest.fn(),
  afterAttach: jest.fn(),
  dropKeys: jest.fn(),
  releaseForPost: jest.fn(),
}
const landing = { enqueue: jest.fn() }
const config = { get: jest.fn() }
const storage = { getPublicUrl: (k: string) => `https://cdn.test/${k}` }

function build() {
  jest.resetAllMocks()
  aiReview.enqueue.mockResolvedValue(undefined)
  landing.enqueue.mockResolvedValue(undefined)
  config.get.mockReturnValue(undefined)
  mediaAssets.afterAttach.mockResolvedValue(undefined)
  mediaAssets.dropKeys.mockResolvedValue(undefined)
  mediaAssets.releaseForPost.mockResolvedValue(undefined)
  mediaAssets.removeAdCreativeMedia.mockResolvedValue([])
  return new AdsCampaignsService(repo as never, aiReview as never, mediaAssets as never, storage as never, landing as never, config as never)
}

describe('editar anúncio', () => {
  it('anúncio aprovado editado volta para a revisão, e a IA e a página são conferidas de novo', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(adRow('APPROVED'))
    repo.updateAd.mockResolvedValue({ ...adRow('PENDING'), creative: creative({ headline: 'Pão novo' }) })
    const view = await service.updateAd('co1', 'ad1', { headline: 'Pão <b>novo</b>' } as UpdateAdDto)
    expect(repo.updateAd).toHaveBeenCalledWith('ad1', { expectedReviewStatus: 'APPROVED', backToReview: true, name: 'Pão novo', creative: { headline: 'Pão novo' } })
    expect(aiReview.enqueue).toHaveBeenCalledWith('ad1')
    expect(landing.enqueue).toHaveBeenCalledWith('ad1', 'SUBMIT')
    expect(view.reviewStatus).toBe('PENDING')
  })

  it('anúncio em revisão editado continua em revisão (e renova o envio)', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(adRow('PENDING'))
    repo.updateAd.mockResolvedValue(adRow('PENDING'))
    await service.updateAd('co1', 'ad1', { body: 'Texto novo' } as UpdateAdDto)
    expect(repo.updateAd).toHaveBeenCalledWith('ad1', expect.objectContaining({ expectedReviewStatus: 'PENDING', backToReview: true }))
  })

  it.each(['NOT_SUBMITTED', 'REJECTED'])('anúncio %s só é editado: não vai para a revisão sozinho', async (status) => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(adRow(status))
    repo.updateAd.mockResolvedValue(adRow(status))
    await service.updateAd('co1', 'ad1', { ctaLabel: 'Comprar' } as UpdateAdDto)
    expect(repo.updateAd).toHaveBeenCalledWith('ad1', expect.objectContaining({ backToReview: false, creative: { ctaLabel: 'Comprar' } }))
    expect(aiReview.enqueue).not.toHaveBeenCalled()
    expect(landing.enqueue).not.toHaveBeenCalled()
  })

  it('só o que mudou vai para o banco; mudar nada não mexe em nada nem pede nova revisão', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(adRow('APPROVED'))
    const view = await service.updateAd('co1', 'ad1', { headline: 'Pão quente', body: 'Entrega rápida', ctaLabel: 'Saiba mais' } as UpdateAdDto)
    expect(repo.updateAd).not.toHaveBeenCalled()
    expect(aiReview.enqueue).not.toHaveBeenCalled()
    expect(view.reviewStatus).toBe('APPROVED')
  })

  it('anúncio de outra empresa ou que não existe: 404', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValueOnce(adRow('APPROVED', 'ACTIVE', 'outra'))
    await expect(service.updateAd('co1', 'ad1', { headline: 'x1' } as UpdateAdDto)).rejects.toBeInstanceOf(NotFoundException)
    repo.findAdForEdit.mockResolvedValueOnce(null)
    await expect(service.updateAd('co1', 'ad1', { headline: 'x1' } as UpdateAdDto)).rejects.toBeInstanceOf(NotFoundException)
    expect(repo.updateAd).not.toHaveBeenCalled()
  })

  it('campanha arquivada não é editada', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(adRow('APPROVED', 'ARCHIVED'))
    await expect(service.updateAd('co1', 'ad1', { headline: 'Novo título' } as UpdateAdDto)).rejects.toThrow('arquivada')
  })

  it('link novo passa pelas mesmas regras do cadastro', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(adRow('REJECTED'))
    await expect(service.updateAd('co1', 'ad1', { destinationUrl: 'https://bit.ly/abc' } as UpdateAdDto)).rejects.toThrow('encurtados')
    config.get.mockImplementation((k: string) => (k === 'ADS_BLOCKED_DOMAINS' ? 'golpe.com.br' : undefined))
    await expect(service.updateAd('co1', 'ad1', { destinationUrl: 'https://golpe.com.br/x' } as UpdateAdDto)).rejects.toThrow('não pode ser usado')
    expect(repo.updateAd).not.toHaveBeenCalled()
  })

  it('texto que vira vazio depois de limpar é recusado', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(adRow('REJECTED'))
    await expect(service.updateAd('co1', 'ad1', { body: '<b></b>' } as UpdateAdDto)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('se a moderação decidiu no meio da edição, a troca não vale (409) e nada é enfileirado', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(adRow('PENDING'))
    repo.updateAd.mockResolvedValue(null)
    await expect(service.updateAd('co1', 'ad1', { headline: 'Novo título' } as UpdateAdDto)).rejects.toBeInstanceOf(ConflictException)
    expect(aiReview.enqueue).not.toHaveBeenCalled()
  })

  it('reenviar com link que entrou na lista de bloqueio é recusado', async () => {
    const service = build()
    config.get.mockImplementation((k: string) => (k === 'ADS_BLOCKED_DOMAINS' ? 'padaria.com.br' : undefined))
    repo.findAd.mockResolvedValue({ ...adRow('REJECTED'), creative: creative() })
    await expect(service.submitAd('co1', 'ad1')).rejects.toThrow('Edite o anúncio')
    expect(repo.submitAd).not.toHaveBeenCalled()
  })
})

describe('editar público e orçamento', () => {
  const saveAndReturn = (service: AdsCampaignsService) => {
    repo.updateAdSet.mockResolvedValue({})
    repo.findCampaign.mockResolvedValue(tree())
    return service
  }

  it('só muda o que veio: orçamento e lance', async () => {
    const service = saveAndReturn(build())
    repo.findAdSetForEdit.mockResolvedValue(setRow())
    await service.updateAdSet('co1', 'set1', { dailyBudgetCents: 5000, bidCapCents: 120 } as UpdateAdSetDto)
    expect(repo.updateAdSet).toHaveBeenCalledWith('set1', { dailyBudgetCents: 5000, bidCapCents: 120 })
  })

  it('devolve a campanha inteira atualizada', async () => {
    const service = saveAndReturn(build())
    repo.findAdSetForEdit.mockResolvedValue(setRow())
    const view = await service.updateAdSet('co1', 'set1', { name: 'Novo público' } as UpdateAdSetDto)
    expect(view.id).toBe('camp1')
    expect(repo.findCampaign).toHaveBeenCalledWith('camp1')
  })

  it('público automático zera interesses, idade e gênero', async () => {
    const service = saveAndReturn(build())
    repo.findAdSetForEdit.mockResolvedValue(setRow())
    await service.updateAdSet('co1', 'set1', { automaticAudience: true } as UpdateAdSetDto)
    expect(repo.updateAdSet).toHaveBeenCalledWith('set1', { automaticAudience: true, interests: [], ageBands: [], genders: [] })
  })

  it('conjunto já automático ignora filtros mandados à mão', async () => {
    const service = saveAndReturn(build())
    repo.findAdSetForEdit.mockResolvedValue(setRow({ automaticAudience: true, interests: [], ageBands: [], genders: [] }))
    await service.updateAdSet('co1', 'set1', { interests: ['sports'], cities: ['  Campinas ', 'Campinas'] } as UpdateAdSetDto)
    expect(repo.updateAdSet).toHaveBeenCalledWith('set1', { interests: [], ageBands: [], genders: [], cities: ['Campinas'] })
  })

  it('escolher o público à mão guarda os filtros sem repetir', async () => {
    const service = saveAndReturn(build())
    repo.findAdSetForEdit.mockResolvedValue(setRow({ automaticAudience: true, interests: [], ageBands: [], genders: [] }))
    await service.updateAdSet('co1', 'set1', { automaticAudience: false, interests: ['sports', 'sports'], ageBands: ['18-24'] } as UpdateAdSetDto)
    expect(repo.updateAdSet).toHaveBeenCalledWith('set1', { automaticAudience: false, interests: ['sports'], ageBands: ['18-24'] })
  })

  it('data de fim: depois do início, nunca no passado, e null tira o fim', async () => {
    const service = saveAndReturn(build())
    repo.findAdSetForEdit.mockResolvedValue(setRow())
    await expect(service.updateAdSet('co1', 'set1', { endAt: '2026-11-19' } as UpdateAdSetDto)).rejects.toThrow('depois da data de início')
    await expect(service.updateAdSet('co1', 'set1', { endAt: '2026-11-21' } as UpdateAdSetDto)).rejects.toThrow('antes de hoje')
    await service.updateAdSet('co1', 'set1', { endAt: null } as UpdateAdSetDto)
    expect(repo.updateAdSet).toHaveBeenCalledWith('set1', { endAt: null })
  })

  it('corpo vazio, campanha arquivada e conjunto de outra empresa são recusados', async () => {
    const service = saveAndReturn(build())
    repo.findAdSetForEdit.mockResolvedValueOnce(setRow())
    await expect(service.updateAdSet('co1', 'set1', {} as UpdateAdSetDto)).rejects.toThrow('Nada para mudar')
    repo.findAdSetForEdit.mockResolvedValueOnce(setRow({}, 'ARCHIVED'))
    await expect(service.updateAdSet('co1', 'set1', { name: 'Outro nome' } as UpdateAdSetDto)).rejects.toThrow('arquivada')
    repo.findAdSetForEdit.mockResolvedValueOnce(setRow({}, 'ACTIVE', 'outra'))
    await expect(service.updateAdSet('co1', 'set1', { name: 'Outro nome' } as UpdateAdSetDto)).rejects.toBeInstanceOf(NotFoundException)
    expect(repo.updateAdSet).not.toHaveBeenCalled()
  })
})

describe('duplicar campanha', () => {
  it('copia como rascunho, começando hoje, sem foto ou vídeo', async () => {
    const service = build()
    const source = tree({ adSets: [{ ...setRow({ endAt: new Date('2099-01-01T03:00:00Z') }), ads: [{ ...adRow(), creative: creative({ media: { id: 'm1' } }) }] }] })
    repo.findCampaign.mockResolvedValue(source)
    repo.duplicateCampaign.mockResolvedValue(tree({ id: 'camp2', name: 'Cópia de Dezembro', status: 'DRAFT' }))
    const view = await service.duplicateCampaign('co1', 'camp1')
    const arg = repo.duplicateCampaign.mock.calls[0][0]
    expect(arg.name).toBe('Cópia de Dezembro')
    expect(arg.objective).toBe('TRAFFIC')
    expect(arg.adSets[0].set).toMatchObject({ dailyBudgetCents: 2000, states: ['SP'], interests: ['food-drink'], automaticAudience: false })
    expect(arg.adSets[0].set.startAt.getTime()).toBeGreaterThanOrEqual(new Date('2026-11-22T03:00:00Z').getTime())
    expect(arg.adSets[0].set.endAt).toEqual(new Date('2099-01-01T03:00:00Z'))
    expect(arg.adSets[0].ads[0].creative).toEqual({ headline: 'Pão quente', body: 'Entrega rápida', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.com.br' })
    expect(JSON.stringify(arg)).not.toContain('media')
    expect(view.name).toBe('Cópia de Dezembro')
  })

  it('fim que já passou vira "sem data para acabar"; nome longo é cortado', async () => {
    const service = build()
    const long = 'N'.repeat(80)
    repo.findCampaign.mockResolvedValue(tree({ name: long, adSets: [{ ...setRow({ endAt: new Date('2020-01-01T03:00:00Z') }), ads: [{ ...adRow(), creative: creative() }] }] }))
    repo.duplicateCampaign.mockResolvedValue(tree())
    await service.duplicateCampaign('co1', 'camp1')
    const arg = repo.duplicateCampaign.mock.calls[0][0]
    expect(arg.adSets[0].set.endAt).toBeNull()
    expect(arg.name).toHaveLength(80)
  })

  it('campanha de outra empresa: 404; campanha arquivada pode ser copiada', async () => {
    const service = build()
    repo.findCampaign.mockResolvedValueOnce(tree({ account: { id: 'acc1', companyId: 'outra', balanceCents: 0 } }))
    await expect(service.duplicateCampaign('co1', 'camp1')).rejects.toBeInstanceOf(NotFoundException)
    repo.findCampaign.mockResolvedValueOnce(tree({ status: 'ARCHIVED' }))
    repo.duplicateCampaign.mockResolvedValue(tree())
    await expect(service.duplicateCampaign('co1', 'camp1')).resolves.toBeDefined()
  })
})

describe('trocar a foto ou o vídeo do anúncio', () => {
  const tx = { tx: true }
  const prepared = { items: [{ id: 'm2', kind: 'IMAGE', position: 0 }], media: [], mediaKeys: ['k2'], renderedKeys: ['k2'] }
  const withMedia = (status = 'APPROVED') => ({ ...adRow(status), creative: creative({ media: { id: 'm1', status: 'READY', kind: 'IMAGE', format: 'SQUARE' } }) })
  const input = { id: 'm2', format: 'SQUARE' } as never

  /** O repositório de verdade roda a função da transação; aqui rodamos com um tx falso e devolvemos o anúncio. */
  const runTx = (result: unknown) =>
    repo.updateAd.mockImplementation(async (_id: string, params: { inTransaction?: (t: unknown, c: string) => Promise<void> }) => {
      await params.inTransaction?.(tx, 'cr1')
      return result
    })

  it('troca: tira a antiga, liga a nova na mesma transação e só depois apaga os arquivos antigos', async () => {
    const service = build()
    const order: string[] = []
    repo.findAdForEdit.mockResolvedValue(withMedia('APPROVED'))
    mediaAssets.prepareForAdCreative.mockResolvedValue(prepared)
    mediaAssets.removeAdCreativeMedia.mockImplementation(async () => { order.push('remove'); return ['old.jpg', 'old.feed.jpg'] })
    mediaAssets.attachToAdCreative.mockImplementation(async () => { order.push('attach') })
    mediaAssets.afterAttach.mockImplementation(async () => { order.push('afterAttach') })
    mediaAssets.dropKeys.mockImplementation(async () => { order.push('dropKeys') })
    runTx({ ...adRow('PENDING'), creative: creative() })
    const view = await service.updateAdMedia('co1', 'ad1', 'u1', input)
    expect(order).toEqual(['remove', 'attach', 'afterAttach', 'dropKeys'])
    expect(mediaAssets.removeAdCreativeMedia).toHaveBeenCalledWith(tx, 'cr1')
    expect(mediaAssets.attachToAdCreative).toHaveBeenCalledWith(tx, 'cr1', prepared)
    expect(mediaAssets.dropKeys).toHaveBeenCalledWith(['old.jpg', 'old.feed.jpg'])
    expect(repo.updateAd).toHaveBeenCalledWith('ad1', expect.objectContaining({ expectedReviewStatus: 'APPROVED', backToReview: true, creative: {} }))
    expect(aiReview.enqueue).toHaveBeenCalledWith('ad1')
    expect(landing.enqueue).toHaveBeenCalledWith('ad1', 'SUBMIT')
    expect(view.id).toBe('ad1')
  })

  it('tirar a mídia deixa o anúncio só de texto (sem preparar arquivo novo) e volta para a revisão', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(withMedia('APPROVED'))
    mediaAssets.removeAdCreativeMedia.mockResolvedValue(['old.jpg'])
    runTx(adRow('PENDING'))
    await service.updateAdMedia('co1', 'ad1', 'u1', null)
    expect(mediaAssets.prepareForAdCreative).not.toHaveBeenCalled()
    expect(mediaAssets.attachToAdCreative).not.toHaveBeenCalled()
    expect(mediaAssets.dropKeys).toHaveBeenCalledWith(['old.jpg'])
    expect(aiReview.enqueue).toHaveBeenCalled()
  })

  it('tirar a mídia de anúncio que já é só texto não faz nada', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(adRow('APPROVED'))
    await service.updateAdMedia('co1', 'ad1', 'u1', null)
    expect(repo.updateAd).not.toHaveBeenCalled()
    expect(aiReview.enqueue).not.toHaveBeenCalled()
  })

  it('anúncio sem mídia que ganha uma: liga a nova (nada para apagar)', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(adRow('NOT_SUBMITTED'))
    mediaAssets.prepareForAdCreative.mockResolvedValue(prepared)
    runTx(adRow('NOT_SUBMITTED'))
    await service.updateAdMedia('co1', 'ad1', 'u1', input)
    expect(mediaAssets.attachToAdCreative).toHaveBeenCalled()
    expect(mediaAssets.dropKeys).toHaveBeenCalledWith([])
    expect(repo.updateAd).toHaveBeenCalledWith('ad1', expect.objectContaining({ backToReview: false }))
    expect(aiReview.enqueue).not.toHaveBeenCalled()
  })

  it('arquivo recusado pelas regras de anúncio (ex.: foto estreita): nada muda', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(withMedia())
    mediaAssets.prepareForAdCreative.mockRejectedValue(new BadRequestException('Essa foto é pequena demais para anúncio.'))
    await expect(service.updateAdMedia('co1', 'ad1', 'u1', input)).rejects.toThrow('pequena demais')
    expect(repo.updateAd).not.toHaveBeenCalled()
    expect(mediaAssets.dropKeys).not.toHaveBeenCalled()
  })

  it('moderação decidiu no meio: 409, o arquivo novo é liberado e o antigo NÃO é apagado', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(withMedia('PENDING'))
    mediaAssets.prepareForAdCreative.mockResolvedValue(prepared)
    repo.updateAd.mockResolvedValue(null)
    await expect(service.updateAdMedia('co1', 'ad1', 'u1', input)).rejects.toBeInstanceOf(ConflictException)
    expect(mediaAssets.releaseForPost).toHaveBeenCalledWith(prepared)
    expect(mediaAssets.dropKeys).not.toHaveBeenCalled()
    expect(aiReview.enqueue).not.toHaveBeenCalled()
  })

  it('falha na transação: libera o arquivo novo, mantém o antigo e repassa o erro', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValue(withMedia())
    mediaAssets.prepareForAdCreative.mockResolvedValue(prepared)
    repo.updateAd.mockRejectedValue(new Error('banco caiu'))
    await expect(service.updateAdMedia('co1', 'ad1', 'u1', input)).rejects.toThrow('banco caiu')
    expect(mediaAssets.releaseForPost).toHaveBeenCalledWith(prepared)
    expect(mediaAssets.dropKeys).not.toHaveBeenCalled()
  })

  it('empresa errada, anúncio inexistente e campanha arquivada', async () => {
    const service = build()
    repo.findAdForEdit.mockResolvedValueOnce(adRow('APPROVED', 'ACTIVE', 'outra'))
    await expect(service.updateAdMedia('co1', 'ad1', 'u1', input)).rejects.toBeInstanceOf(NotFoundException)
    repo.findAdForEdit.mockResolvedValueOnce(null)
    await expect(service.updateAdMedia('co1', 'ad1', 'u1', input)).rejects.toBeInstanceOf(NotFoundException)
    repo.findAdForEdit.mockResolvedValueOnce(adRow('APPROVED', 'ARCHIVED'))
    await expect(service.updateAdMedia('co1', 'ad1', 'u1', input)).rejects.toThrow('arquivada')
    expect(mediaAssets.prepareForAdCreative).not.toHaveBeenCalled()
  })

  it('rascunho e recusado: só trocam, sem ir para a revisão', async () => {
    for (const status of ['NOT_SUBMITTED', 'REJECTED']) {
      const service = build()
      repo.findAdForEdit.mockResolvedValue(withMedia(status))
      mediaAssets.prepareForAdCreative.mockResolvedValue(prepared)
      runTx(adRow(status))
      await service.updateAdMedia('co1', 'ad1', 'u1', input)
      expect(repo.updateAd).toHaveBeenCalledWith('ad1', expect.objectContaining({ backToReview: false }))
      expect(aiReview.enqueue).not.toHaveBeenCalled()
    }
  })
})
