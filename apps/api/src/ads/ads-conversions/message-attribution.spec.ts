// jsdom não carrega no Jest; o mesmo efeito do sanitize com tags proibidas.
jest.mock('isomorphic-dompurify', () => {
  const sanitize = (v: string) => v.replace(/<[^>]+>/g, '')
  return { __esModule: true, default: { sanitize }, sanitize }
})

import { AdsConversionsService } from './ads-conversions.service'
import { messageAttributionProblem, newClickToken, type MessageAttributionFacts } from './conversion-rules'

const NOW = new Date('2026-11-24T12:00:00.000Z')
const CLICKED = new Date('2026-11-24T11:55:00.000Z')
const TOKEN = newClickToken()
const WHO = { userId: 'user-1', companyId: 'co-1' }

const facts = (patch: Partial<MessageAttributionFacts> = {}): MessageAttributionFacts => ({
  userId: 'user-1',
  clickedAt: CLICKED,
  landedAt: null,
  objective: 'MESSAGES',
  destinationKind: 'PAGE_MESSAGE',
  companyId: 'co-1',
  ...patch,
})

describe('conversa iniciada pelo anúncio: quando a mensagem conta', () => {
  it('mesma pessoa, anúncio de mensagens, mesma empresa, clique válido e recente: conta', () => {
    expect(messageAttributionProblem(facts(), WHO, NOW)).toBeNull()
  })

  it('exibição de outra pessoa (token emprestado) não conta', () => {
    expect(messageAttributionProblem(facts({ userId: 'user-2' }), WHO, NOW)).toBe('NOT_YOURS')
  })

  it('anúncio que não é de mensagens para o chat não conta', () => {
    expect(messageAttributionProblem(facts({ objective: 'TRAFFIC' }), WHO, NOW)).toBe('NOT_A_MESSAGE_AD')
    expect(messageAttributionProblem(facts({ destinationKind: 'URL' }), WHO, NOW)).toBe('NOT_A_MESSAGE_AD')
  })

  it('mensagem para outra empresa não conta (o clique era de outro anunciante)', () => {
    expect(messageAttributionProblem(facts({ companyId: 'co-2' }), WHO, NOW)).toBe('OTHER_COMPANY')
  })

  it('sem clique nenhum, não conta', () => {
    expect(messageAttributionProblem(facts({ clickedAt: null, landedAt: null }), WHO, NOW)).toBe('NO_CLICK')
  })

  it('o link de reserva (apps antigos) vale no lugar do clique', () => {
    expect(messageAttributionProblem(facts({ clickedAt: null, landedAt: CLICKED }), WHO, NOW)).toBeNull()
  })

  it('até 7 dias depois do clique conta; passou disso, não', () => {
    const sixDays = new Date(NOW.getTime() - 6 * 86_400_000)
    const eightDays = new Date(NOW.getTime() - 8 * 86_400_000)
    expect(messageAttributionProblem(facts({ clickedAt: sixDays }), WHO, NOW)).toBeNull()
    expect(messageAttributionProblem(facts({ clickedAt: eightDays }), WHO, NOW)).toBe('OUTSIDE_WINDOW')
  })

  it('clique no futuro (relógio errado demais) não conta', () => {
    expect(messageAttributionProblem(facts({ clickedAt: new Date(NOW.getTime() + 3_600_000) }), WHO, NOW)).toBe('OUTSIDE_WINDOW')
  })
})

describe('AdsConversionsService.recordMessageStarted', () => {
  function impressionRow(patch: Record<string, unknown> = {}) {
    return {
      id: 'imp-1',
      userId: 'user-1',
      adId: 'ad-1',
      clickedAt: CLICKED as Date | null,
      landedAt: null as Date | null,
      ad: {
        adSetId: 'set-1',
        creative: { destinationKind: 'PAGE_MESSAGE' },
        adSet: { campaign: { objective: 'MESSAGES', accountId: 'acc-1', account: { companyId: 'co-1' } } },
      },
      ...patch,
    }
  }
  function build(found: ReturnType<typeof impressionRow> | null = impressionRow()) {
    const repo = {
      findImpressionForMessage: jest.fn().mockResolvedValue(found),
      conversionExists: jest.fn().mockResolvedValue(false),
      record: jest.fn().mockResolvedValue(true),
    }
    return { repo, service: new AdsConversionsService(repo as never) }
  }
  const input = { userId: 'user-1', companyId: 'co-1', clickId: TOKEN }

  it('grava uma conversão CONTACT vinda do Votz, sem chave e sem valor', async () => {
    const { repo, service } = build()
    await expect(service.recordMessageStarted(input, NOW)).resolves.toBe('RECORDED')
    expect(repo.record).toHaveBeenCalledWith({
      impressionId: 'imp-1',
      adId: 'ad-1',
      adSetId: 'set-1',
      accountId: 'acc-1',
      keyId: null,
      source: 'VOTZ_MESSAGE',
      eventName: 'CONTACT',
      valueCents: 0,
      occurredAt: NOW,
      dedupeKey: 'msg:imp-1',
      day: '2026-11-24',
    })
  })

  it('conta uma vez por clique: a segunda mensagem não soma de novo', async () => {
    const { repo, service } = build()
    repo.conversionExists.mockResolvedValue(true)
    await expect(service.recordMessageStarted(input, NOW)).resolves.toBe('DUPLICATE')
    expect(repo.record).not.toHaveBeenCalled()
  })

  it('dois envios ao mesmo tempo: o banco segura e o segundo vira repetido', async () => {
    const { repo, service } = build()
    repo.record.mockResolvedValue(false)
    await expect(service.recordMessageStarted(input, NOW)).resolves.toBe('DUPLICATE')
  })

  it.each([
    ['identificador inválido', { clickId: 'curto' }],
    ['de outra pessoa', { userId: 'user-2' }],
    ['de outra empresa', { companyId: 'co-2' }],
  ])('%s: ignora e não grava nada', async (_name, patch) => {
    const { repo, service } = build()
    await expect(service.recordMessageStarted({ ...input, ...patch }, NOW)).resolves.toBe('IGNORED')
    expect(repo.record).not.toHaveBeenCalled()
  })

  it('clique que não existe: ignora', async () => {
    const { repo, service } = build(null)
    await expect(service.recordMessageStarted(input, NOW)).resolves.toBe('IGNORED')
    expect(repo.record).not.toHaveBeenCalled()
  })

  it('falha do banco nunca estoura: devolve IGNORED (a mensagem já foi enviada)', async () => {
    const { repo, service } = build()
    repo.findImpressionForMessage.mockRejectedValue(new Error('banco fora'))
    await expect(service.recordMessageStarted(input, NOW)).resolves.toBe('IGNORED')
  })
})
