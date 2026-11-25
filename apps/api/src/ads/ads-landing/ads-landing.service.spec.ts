import type { Queue } from 'bullmq'
import type { NotificationsService } from '../../notifications/notifications.service'
import type { AdsLandingRepository } from './ads-landing.repository'
import { AdsLandingService } from './ads-landing.service'
import type { LandingFetchResult, LandingFetcher } from './landing-fetcher'

const NOW = new Date('2026-11-22T15:00:00.000Z')

const ok: LandingFetchResult = { status: 'OK', httpStatus: 200, finalHost: 'padaria.com.br', redirects: 0, problems: [] }
const down: LandingFetchResult = { status: 'UNREACHABLE', httpStatus: null, finalHost: 'padaria.com.br', redirects: 0, problems: [] }
const blocked: LandingFetchResult = { status: 'BLOCKED', httpStatus: null, finalHost: 'bit.ly', redirects: 1, problems: ['BLOCKED_DOMAIN'] }

const liveAd = (patch: Record<string, unknown> = {}, campaignStatus = 'ACTIVE') => ({
  id: 'ad-1',
  status: 'DRAFT',
  reviewStatus: 'APPROVED',
  creative: { destinationUrl: 'https://padaria.com.br/oferta', destinationKind: 'URL' },
  adSet: { campaign: { id: 'camp-1', name: 'Dezembro', status: campaignStatus, account: { companyId: 'co-1' } } },
  ...patch,
})

function build(result: LandingFetchResult, ad: unknown = liveAd(), previous: { status: string } | null = null) {
  const queue = { add: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<Queue>
  const repo = {
    findAdForCheck: jest.fn().mockResolvedValue(ad),
    previousCheck: jest.fn().mockResolvedValue(previous),
    saveCheck: jest.fn().mockResolvedValue({}),
    dueForRecheck: jest.fn().mockResolvedValue(['a', 'b']),
    pauseCampaign: jest.fn().mockResolvedValue(true),
    findAdvertiserUserIds: jest.fn().mockResolvedValue(['u1', 'u2']),
  } as unknown as jest.Mocked<AdsLandingRepository>
  const fetcher = { fetch: jest.fn().mockResolvedValue(result) } as unknown as jest.Mocked<LandingFetcher>
  const notifications = { notify: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<NotificationsService>
  return { queue, repo, fetcher, notifications, service: new AdsLandingService(queue, repo, fetcher, notifications) }
}

describe('AdsLandingService.check', () => {
  it('anúncio que não existe mais não faz nada', async () => {
    const { repo, fetcher, service } = build(ok, null)
    expect(await service.check('x', 'WEEKLY', NOW)).toBe('skipped')
    expect(fetcher.fetch).not.toHaveBeenCalled()
    expect(repo.saveCheck).not.toHaveBeenCalled()
  })

  it('ao enviar, só registra, mesmo que a página esteja fora do ar (a moderação decide)', async () => {
    const { repo, service, queue } = build(down)
    expect(await service.check('ad-1', 'SUBMIT', NOW)).toBe('recorded')
    expect(repo.saveCheck).toHaveBeenCalledWith('ad-1', 'SUBMIT', down, NOW)
    expect(repo.pauseCampaign).not.toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('página abre: registra e segue', async () => {
    const { repo, service } = build(ok)
    expect(await service.check('ad-1', 'WEEKLY', NOW)).toBe('recorded')
    expect(repo.pauseCampaign).not.toHaveBeenCalled()
  })

  it('primeira falha de um anúncio no ar: confere de novo em 6 horas, sem pausar', async () => {
    const { repo, queue, notifications, service } = build(down, liveAd(), { status: 'OK' })
    expect(await service.check('ad-1', 'WEEKLY', NOW)).toBe('retry-scheduled')
    expect(queue.add).toHaveBeenCalledWith('check', { adId: 'ad-1', trigger: 'RETRY' }, expect.objectContaining({ delay: 6 * 3600_000 }))
    expect(repo.pauseCampaign).not.toHaveBeenCalled()
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it('segunda falha seguida pausa a campanha e avisa quem gerencia anúncios', async () => {
    const { repo, notifications, service } = build(down, liveAd(), { status: 'UNREACHABLE' })
    expect(await service.check('ad-1', 'RETRY', NOW)).toBe('paused')
    expect(repo.pauseCampaign).toHaveBeenCalledWith('camp-1')
    expect(notifications.notify).toHaveBeenCalledTimes(2)
    expect(notifications.notify).toHaveBeenCalledWith({ userId: 'u1', type: 'AD_LANDING_PAGE', metadata: { adId: 'ad-1', campaignName: 'Dezembro', status: 'UNREACHABLE', host: 'padaria.com.br' } })
  })

  it('página bloqueada pausa na hora, sem esperar a segunda conferência', async () => {
    const { repo, service } = build(blocked, liveAd(), null)
    expect(await service.check('ad-1', 'WEEKLY', NOW)).toBe('paused')
    expect(repo.pauseCampaign).toHaveBeenCalled()
  })

  it('campanha já desligada ou anúncio não aprovado só registra (ninguém paga por ele)', async () => {
    const off = build(blocked, liveAd({}, 'PAUSED'))
    expect(await off.service.check('ad-1', 'WEEKLY', NOW)).toBe('recorded')
    expect(off.repo.pauseCampaign).not.toHaveBeenCalled()
    const pending = build(blocked, liveAd({ reviewStatus: 'PENDING' }))
    expect(await pending.service.check('ad-1', 'WEEKLY', NOW)).toBe('recorded')
    const stopped = build(blocked, liveAd({ status: 'PAUSED' }))
    expect(await stopped.service.check('ad-1', 'WEEKLY', NOW)).toBe('recorded')
  })

  it('campanha que alguém já tinha pausado no meio: não avisa de novo', async () => {
    const { notifications, service } = build(blocked, liveAd(), null)
    ;(service as unknown as { repo: jest.Mocked<AdsLandingRepository> }).repo.pauseCampaign.mockResolvedValue(false)
    expect(await service.check('ad-1', 'WEEKLY', NOW)).toBe('recorded')
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it('falha do aviso não desfaz a pausa', async () => {
    const { notifications, service } = build(blocked, liveAd(), null)
    notifications.notify.mockRejectedValue(new Error('sino fora'))
    expect(await service.check('ad-1', 'WEEKLY', NOW)).toBe('paused')
  })
})

describe('AdsLandingService: fila e agenda', () => {
  it('enfileirar nunca lança, mesmo com a fila fora do ar', async () => {
    const { queue, service } = build(ok)
    queue.add.mockRejectedValue(new Error('redis fora'))
    await expect(service.enqueue('ad-1', 'SUBMIT')).resolves.toBeUndefined()
  })

  it('a agenda diária enfileira os anúncios sem conferência há 7 dias', async () => {
    const { repo, queue, service } = build(ok)
    expect(await service.scheduleWeekly(NOW)).toBe(2)
    const since = repo.dueForRecheck.mock.calls[0][0]
    expect(since.toISOString()).toBe('2026-11-15T15:00:00.000Z')
    expect(queue.add).toHaveBeenCalledTimes(2)
    expect(queue.add).toHaveBeenCalledWith('check', { adId: 'a', trigger: 'WEEKLY' }, expect.anything())
  })

  it('erro ao agendar não derruba nada', async () => {
    const { repo, service } = build(ok)
    repo.dueForRecheck.mockRejectedValue(new Error('banco'))
    expect(await service.scheduleWeekly(NOW)).toBe(0)
  })
})
