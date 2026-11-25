// jsdom não carrega no Jest; o mesmo efeito do sanitize com tags proibidas: tira script com conteúdo e as tags.
jest.mock('isomorphic-dompurify', () => {
  const sanitize = (v: string) => v.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '')
  return { __esModule: true, default: { sanitize }, sanitize }
})

import { Test } from '@nestjs/testing'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { AdsReviewService } from './ads-review.service'
import { AdsReviewRepository } from './ads-review.repository'
import { NotificationsService } from '../../notifications/notifications.service'
import { StorageService } from '../../storage/storage.service'

const repo = { listQueue: jest.fn(), findForReview: jest.fn(), decide: jest.fn(), findAdvertiserUserIds: jest.fn() }
const notifications = { notify: jest.fn() }
const storage = { getPublicUrl: (key: string) => `https://cdn.test/${key}` }

const now = new Date('2026-11-22T12:00:00Z')
const creative = { id: 'cr1', headline: 'Pão quente', body: 'Entrega rápida', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.com.br', destinationKind: 'URL', media: [] }
const pendingAd = { id: 'ad1', reviewStatus: 'PENDING', creative, adSet: { campaign: { name: 'Dezembro', account: { companyId: 'co1' } } } }
const mediaRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'media-1', kind: 'VIDEO', status: 'READY', format: 'PORTRAIT', key: 'posts/m1.mp4', feedKey: null, thumbKey: null, posterKey: 'posts/m1.poster.jpg',
  width: 1080, height: 1350, sourceWidth: 1080, sourceHeight: 1920, durationMs: 20_000, legacy: false, ...overrides,
})
const adWithMedia = (media: unknown) => ({ ...pendingAd, creative: { ...creative, media: [media] } })

describe('AdsReviewService', () => {
  let service: AdsReviewService

  beforeEach(async () => {
    jest.resetAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        AdsReviewService,
        { provide: AdsReviewRepository, useValue: repo },
        { provide: NotificationsService, useValue: notifications },
        { provide: StorageService, useValue: storage },
      ],
    }).compile()
    service = module.get(AdsReviewService)
    repo.findAdvertiserUserIds.mockResolvedValue([])
    notifications.notify.mockResolvedValue({})
  })

  describe('listQueue', () => {
    it('monta a fila com empresa, público e histórico, e limita a página a 50', async () => {
      repo.listQueue.mockResolvedValue({
        total: 1,
        pendingCount: 1,
        data: [{
          id: 'ad1', reviewStatus: 'PENDING', submittedAt: now, reviewedAt: null, reviewNote: null, creative: { ...creative, media: [mediaRow()] },
          adSet: {
            states: ['SP'], cities: [], interests: ['food-drink'], ageBands: ['25-34'], genders: [], automaticAudience: false, dailyBudgetCents: 2000,
            campaign: { name: 'Dezembro', objective: 'TRAFFIC', account: { name: 'Conta principal', company: { id: 'co1', tradeName: 'Padaria', verified: true } } },
          },
          aiAnalyses: [{ category: 'food-drink', restricted: null, violations: [{ id: 'gambling', confidence: 0.3 }], sensitive: false, confidence: 0.8, explanation: 'Texto comum.', autoApproved: false, createdAt: now }],
          landingChecks: [{ status: 'OK', httpStatus: 200, finalHost: 'padaria.com.br', problems: ['REDIRECT_OFF_SITE'], checkedAt: now }],
          reviews: [{ decision: 'REJECTED', reason: 'Link quebrado', source: 'HUMAN', reviewer: { name: 'Moderadora' }, createdAt: now }],
        }],
      })
      const result = await service.listQueue('PENDING', 1, 500)
      expect(repo.listQueue).toHaveBeenCalledWith('PENDING', 1, 50)
      expect(result.meta).toEqual({ total: 1, pendingCount: 1, page: 1, limit: 50, totalPages: 1 })
      expect(result.data[0]).toMatchObject({
        adId: 'ad1',
        company: { id: 'co1', name: 'Padaria', verified: true },
        campaignName: 'Dezembro',
        creative: { headline: 'Pão quente', media: { kind: 'VIDEO', status: 'READY', url: 'https://cdn.test/posts/m1.mp4', posterUrl: 'https://cdn.test/posts/m1.poster.jpg' } },
        history: [{ decision: 'REJECTED', reviewerName: 'Moderadora' }],
        landing: { status: 'OK', httpStatus: 200, finalHost: 'padaria.com.br', problems: ['REDIRECT_OFF_SITE'] },
      })
    })
  })

  describe('approveByAi', () => {
    it('aprova como IA (sem revisor), guarda o texto e avisa o anunciante', async () => {
      repo.findForReview.mockResolvedValue(pendingAd)
      repo.decide.mockResolvedValue(true)
      repo.findAdvertiserUserIds.mockResolvedValue(['u1'])
      await expect(service.approveByAi('ad1', 'Sem problema.')).resolves.toBe(true)
      expect(repo.decide).toHaveBeenCalledWith(expect.objectContaining({ adId: 'ad1', decision: 'APPROVED', source: 'AI', reviewerId: null, reason: 'Sem problema.' }))
      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', type: 'AD_APPROVED' }))
    })

    it('não mexe em anúncio que já foi decidido por uma pessoa', async () => {
      repo.findForReview.mockResolvedValue({ ...pendingAd, reviewStatus: 'REJECTED' })
      await expect(service.approveByAi('ad1', 'x')).resolves.toBe(false)
      expect(repo.decide).not.toHaveBeenCalled()
    })

    it('se a decisão condicional perde a corrida, devolve false e não avisa', async () => {
      repo.findForReview.mockResolvedValue(pendingAd)
      repo.decide.mockResolvedValue(false)
      await expect(service.approveByAi('ad1', 'x')).resolves.toBe(false)
      expect(notifications.notify).not.toHaveBeenCalled()
    })
  })

  describe('decide', () => {
    it('aprova e guarda o texto do anúncio daquele momento', async () => {
      repo.findForReview.mockResolvedValue(pendingAd)
      repo.decide.mockResolvedValue(true)
      await expect(service.decide('ad1', { id: 'mod1' }, { decision: 'APPROVED' })).resolves.toEqual({ adId: 'ad1', decision: 'APPROVED' })
      expect(repo.decide).toHaveBeenCalledWith({
        adId: 'ad1',
        decision: 'APPROVED',
        reason: null,
        reviewerId: 'mod1',
        creativeSnapshot: { headline: 'Pão quente', body: 'Entrega rápida', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.com.br', destinationKind: 'URL', media: null, mediaItems: [] },
      })
    })


    describe('anunciante editou o anúncio depois de a fila carregar', () => {
      const submitted = new Date('2026-11-22T14:00:00.000Z')
      const edited = { ...pendingAd, submittedAt: new Date('2026-11-22T14:30:00.000Z') }

      it('recusa a decisão (409) se o envio foi renovado, para ninguém aprovar o texto que não leu', async () => {
        repo.findForReview.mockResolvedValue(edited)
        await expect(service.decide('ad1', { id: 'mod1' }, { decision: 'APPROVED', expectedSubmittedAt: submitted.toISOString() })).rejects.toBeInstanceOf(ConflictException)
        expect(repo.decide).not.toHaveBeenCalled()
        expect(notifications.notify).not.toHaveBeenCalled()
      })

      it('aceita quando a tela mostrava o envio atual, e a gravação só vale para esse envio', async () => {
        repo.findForReview.mockResolvedValue({ ...pendingAd, submittedAt: submitted })
        repo.decide.mockResolvedValue(true)
        await service.decide('ad1', { id: 'mod1' }, { decision: 'APPROVED', expectedSubmittedAt: submitted.toISOString() })
        expect(repo.decide).toHaveBeenCalledWith(expect.objectContaining({ expectedSubmittedAt: submitted }))
      })

      it('sem a data da tela (cliente antigo) vale a leitura do servidor, que também é conferida na gravação', async () => {
        repo.findForReview.mockResolvedValue({ ...pendingAd, submittedAt: submitted })
        repo.decide.mockResolvedValue(true)
        await service.decide('ad1', { id: 'mod1' }, { decision: 'REJECTED', reason: 'Texto com promessa de cura.' })
        expect(repo.decide).toHaveBeenCalledWith(expect.objectContaining({ expectedSubmittedAt: submitted }))
      })

      it('a IA também não aprova se o texto mudou entre a leitura e a gravação (a gravação é condicional ao envio lido)', async () => {
        repo.findForReview.mockResolvedValue({ ...pendingAd, submittedAt: submitted })
        repo.decide.mockResolvedValue(false)
        await expect(service.approveByAi('ad1', 'Sem problema.')).resolves.toBe(false)
        expect(repo.decide).toHaveBeenCalledWith(expect.objectContaining({ source: 'AI', expectedSubmittedAt: submitted }))
        expect(notifications.notify).not.toHaveBeenCalled()
      })
    })

    describe('com foto ou vídeo', () => {
      it('aprova com a mídia pronta e guarda qual arquivo foi revisado', async () => {
        repo.findForReview.mockResolvedValue(adWithMedia(mediaRow()))
        repo.decide.mockResolvedValue(true)
        await service.decide('ad1', { id: 'mod1' }, { decision: 'APPROVED' })
        expect(repo.decide).toHaveBeenCalledWith(expect.objectContaining({
          creativeSnapshot: expect.objectContaining({ media: { id: 'media-1', kind: 'VIDEO', format: 'PORTRAIT' } }),
        }))
      })

      it.each(['PROCESSING', 'FAILED'])('não aprova vídeo %s (só recusar)', async (status) => {
        repo.findForReview.mockResolvedValue(adWithMedia(mediaRow({ status })))
        await expect(service.decide('ad1', { id: 'mod1' }, { decision: 'APPROVED' })).rejects.toBeInstanceOf(BadRequestException)
        expect(repo.decide).not.toHaveBeenCalled()
      })

      it('recusar vídeo que ainda processa é permitido', async () => {
        repo.findForReview.mockResolvedValue(adWithMedia(mediaRow({ status: 'PROCESSING' })))
        repo.decide.mockResolvedValue(true)
        await expect(service.decide('ad1', { id: 'mod1' }, { decision: 'REJECTED', reason: 'Imagem com promessa de cura.' })).resolves.toEqual({ adId: 'ad1', decision: 'REJECTED' })
      })

      it('a IA pode aprovar anúncio com foto pronta (a política já exigiu que ela lesse a foto)', async () => {
        repo.findForReview.mockResolvedValue(adWithMedia(mediaRow({ kind: 'IMAGE', status: 'READY' })))
        repo.decide.mockResolvedValue(true)
        await expect(service.approveByAi('ad1', 'Sem problema.')).resolves.toBe(true)
        expect(repo.decide).toHaveBeenCalledWith(expect.objectContaining({ source: 'AI', creativeSnapshot: expect.objectContaining({ media: expect.objectContaining({ kind: 'IMAGE' }) }) }))
      })

      it.each([['VIDEO', 'READY'], ['GIF', 'READY'], ['IMAGE', 'PROCESSING'], ['IMAGE', 'FAILED']])('a IA nunca aprova sozinha mídia %s com status %s', async (kind, status) => {
        repo.findForReview.mockResolvedValue(adWithMedia(mediaRow({ kind, status })))
        await expect(service.approveByAi('ad1', 'Sem problema.')).resolves.toBe(false)
        expect(repo.decide).not.toHaveBeenCalled()
      })
    })

    it('recusar exige motivo com pelo menos 10 letras (depois de limpar o texto)', async () => {
      repo.findForReview.mockResolvedValue(pendingAd)
      await expect(service.decide('ad1', { id: 'mod1' }, { decision: 'REJECTED' })).rejects.toBeInstanceOf(BadRequestException)
      await expect(service.decide('ad1', { id: 'mod1' }, { decision: 'REJECTED', reason: '<b>curto</b>' })).rejects.toBeInstanceOf(BadRequestException)
      expect(repo.decide).not.toHaveBeenCalled()
    })

    it('recusa com motivo limpo de tags', async () => {
      repo.findForReview.mockResolvedValue(pendingAd)
      repo.decide.mockResolvedValue(true)
      await service.decide('ad1', { id: 'mod1' }, { decision: 'REJECTED', reason: 'Promete cura <script>x</script>  de doença' })
      expect(repo.decide).toHaveBeenCalledWith(expect.objectContaining({ decision: 'REJECTED', reason: 'Promete cura de doença' }))
    })

    it('anúncio inexistente dá 404', async () => {
      repo.findForReview.mockResolvedValue(null)
      await expect(service.decide('x', { id: 'mod1' }, { decision: 'APPROVED' })).rejects.toBeInstanceOf(NotFoundException)
    })

    it('anúncio que não está pendente dá 409 (não decide duas vezes)', async () => {
      repo.findForReview.mockResolvedValue({ ...pendingAd, reviewStatus: 'APPROVED' })
      await expect(service.decide('ad1', { id: 'mod1' }, { decision: 'REJECTED', reason: 'Motivo bem explicado' })).rejects.toBeInstanceOf(ConflictException)
      expect(repo.decide).not.toHaveBeenCalled()
    })

    it('duas pessoas decidindo juntas: a segunda recebe 409 e ninguém é avisado', async () => {
      repo.findForReview.mockResolvedValue(pendingAd)
      repo.decide.mockResolvedValue(false)
      await expect(service.decide('ad1', { id: 'mod2' }, { decision: 'APPROVED' })).rejects.toBeInstanceOf(ConflictException)
      expect(notifications.notify).not.toHaveBeenCalled()
    })

    it('aprovar avisa quem gerencia anúncios na empresa', async () => {
      repo.findForReview.mockResolvedValue(pendingAd)
      repo.decide.mockResolvedValue(true)
      repo.findAdvertiserUserIds.mockResolvedValue(['u1', 'u2'])
      await service.decide('ad1', { id: 'mod1' }, { decision: 'APPROVED' })
      expect(repo.findAdvertiserUserIds).toHaveBeenCalledWith('co1')
      expect(notifications.notify).toHaveBeenCalledTimes(2)
      expect(notifications.notify).toHaveBeenCalledWith({
        userId: 'u1',
        type: 'AD_APPROVED',
        metadata: { adId: 'ad1', campaignName: 'Dezembro', reason: null },
      })
    })

    it('recusar avisa com o motivo', async () => {
      repo.findForReview.mockResolvedValue(pendingAd)
      repo.decide.mockResolvedValue(true)
      repo.findAdvertiserUserIds.mockResolvedValue(['u1'])
      await service.decide('ad1', { id: 'mod1' }, { decision: 'REJECTED', reason: 'Promete cura de doença' })
      expect(notifications.notify).toHaveBeenCalledWith({
        userId: 'u1',
        type: 'AD_REJECTED',
        metadata: { adId: 'ad1', campaignName: 'Dezembro', reason: 'Promete cura de doença' },
      })
    })

    it('se o aviso falhar, a decisão continua valendo', async () => {
      repo.findForReview.mockResolvedValue(pendingAd)
      repo.decide.mockResolvedValue(true)
      repo.findAdvertiserUserIds.mockResolvedValue(['u1'])
      notifications.notify.mockRejectedValue(new Error('redis fora'))
      await expect(service.decide('ad1', { id: 'mod1' }, { decision: 'APPROVED' })).resolves.toEqual({ adId: 'ad1', decision: 'APPROVED' })
    })
  })
})
