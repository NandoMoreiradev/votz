// jsdom não carrega no Jest; o mesmo efeito do sanitize com tags proibidas.
jest.mock('isomorphic-dompurify', () => {
  const sanitize = (v: string) => v.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '')
  return { __esModule: true, default: { sanitize }, sanitize }
})

import { ConflictException, NotFoundException } from '@nestjs/common'
import { AD_CONVERSIONS, type AdConversionEvent } from '@votz/shared-types'
import { AdsConversionsService } from './ads-conversions.service'
import { hashConversionKey, newClickToken } from './conversion-rules'

const NOW = new Date('2026-11-23T12:00:00.000Z')
const LANDED = new Date('2026-11-22T12:00:00.000Z')
const KEY = { id: 'key-1', accountId: 'acc-1' }
const TOKEN = newClickToken()

function impression(patch: Record<string, unknown> = {}) {
  return {
    id: 'imp-1',
    adId: 'ad-1',
    landedAt: LANDED as Date | null,
    ad: { adSetId: 'set-1', creative: { destinationUrl: 'https://padaria.com.br/bolo' }, adSet: { campaign: { accountId: 'acc-1' } } },
    ...patch,
  }
}

function makeRepo(found: ReturnType<typeof impression> | null = impression()) {
  return {
    findImpressionByToken: jest.fn().mockResolvedValue(found),
    markLanded: jest.fn().mockResolvedValue(NOW),
    findKeyByHash: jest.fn(),
    touchKey: jest.fn().mockResolvedValue({ count: 1 }),
    conversionExists: jest.fn().mockResolvedValue(false),
    countForImpression: jest.fn().mockResolvedValue(0),
    record: jest.fn().mockResolvedValue(true),
    findAccount: jest.fn().mockResolvedValue({ id: 'acc-1', companyId: 'co-1' }),
    listKeys: jest.fn().mockResolvedValue([]),
    countActiveKeys: jest.fn().mockResolvedValue(0),
    createKey: jest.fn().mockImplementation(async (data: { name: string; prefix: string }) => ({ id: 'key-new', name: data.name, prefix: data.prefix, createdAt: NOW, lastUsedAt: null, revokedAt: null })),
    findKey: jest.fn().mockResolvedValue({ id: 'key-1', accountId: 'acc-1', revokedAt: null }),
    revokeKey: jest.fn().mockResolvedValue(true),
  }
}

const event = (patch: Partial<AdConversionEvent> = {}): AdConversionEvent => ({
  clickId: TOKEN,
  eventName: 'PURCHASE',
  valueCents: 4990,
  occurredAt: '2026-11-22T15:00:00.000Z',
  dedupeKey: 'pedido-1',
  ...patch,
})

describe('AdsConversionsService — o clique', () => {
  it('leva ao anunciante com o votz_click_id e marca a primeira abertura', async () => {
    const repo = makeRepo(impression({ landedAt: null }))
    const url = await new AdsConversionsService(repo as never).resolveClick(TOKEN, NOW)
    expect(new URL(url as string).searchParams.get('votz_click_id')).toBe(TOKEN)
    expect(repo.markLanded).toHaveBeenCalledWith('imp-1', NOW)
  })

  it('WhatsApp: leva ao wa.me como está, sem o votz_click_id, e marca a abertura', async () => {
    const wa = 'https://wa.me/5511987654321?text=Ol%C3%A1'
    const repo = makeRepo(impression({ landedAt: null, ad: { adSetId: 'set-1', creative: { destinationUrl: wa, destinationKind: 'WHATSAPP' }, adSet: { campaign: { accountId: 'acc-1' } } } }))
    const url = await new AdsConversionsService(repo as never).resolveClick(TOKEN, NOW)
    expect(url).toBe(wa)
    expect(url).not.toContain('votz_click_id')
    expect(repo.markLanded).toHaveBeenCalledWith('imp-1', NOW)
  })

  it('WhatsApp com endereço que não é wa.me no banco não vira redirecionamento', async () => {
    const repo = makeRepo(impression({ ad: { adSetId: 'set-1', creative: { destinationUrl: 'https://golpe.com/x', destinationKind: 'WHATSAPP' }, adSet: { campaign: { accountId: 'acc-1' } } } }))
    expect(await new AdsConversionsService(repo as never).resolveClick(TOKEN, NOW)).toBeNull()
  })

  it('abrir de novo não muda o carimbo da primeira abertura', async () => {
    const repo = makeRepo()
    expect(await new AdsConversionsService(repo as never).resolveClick(TOKEN, NOW)).not.toBeNull()
    expect(repo.markLanded).not.toHaveBeenCalled()
  })

  it('identificador inventado nem chega no banco; um que não existe devolve nulo', async () => {
    const repo = makeRepo(null)
    const service = new AdsConversionsService(repo as never)
    expect(await service.resolveClick('lixo')).toBeNull()
    expect(repo.findImpressionByToken).not.toHaveBeenCalled()
    expect(await service.resolveClick(TOKEN)).toBeNull()
  })

  it('falha ao registrar a abertura não impede o cidadão de chegar ao anunciante', async () => {
    const repo = makeRepo(impression({ landedAt: null }))
    repo.markLanded.mockRejectedValue(new Error('banco fora'))
    expect(await new AdsConversionsService(repo as never).resolveClick(TOKEN, NOW)).not.toBeNull()
  })

  it('destino com esquema perigoso no banco não vira redirecionamento', async () => {
    const repo = makeRepo(impression({ ad: { adSetId: 's', creative: { destinationUrl: 'javascript:alert(1)' }, adSet: { campaign: { accountId: 'acc-1' } } } }))
    expect(await new AdsConversionsService(repo as never).resolveClick(TOKEN, NOW)).toBeNull()
  })
})

describe('AdsConversionsService — a chave', () => {
  it('chave certa entra; revogada, desconhecida ou sem o prefixo, não', async () => {
    const repo = makeRepo()
    const service = new AdsConversionsService(repo as never)
    const raw = 'vzc_' + 'a'.repeat(43)
    repo.findKeyByHash.mockResolvedValue({ id: 'key-1', accountId: 'acc-1', revokedAt: null, lastUsedAt: null })
    expect(await service.authenticate(raw, NOW)).toEqual(KEY)
    expect(repo.findKeyByHash).toHaveBeenCalledWith(hashConversionKey(raw))
    expect(repo.touchKey).toHaveBeenCalledWith('key-1', NOW)

    repo.findKeyByHash.mockResolvedValue({ id: 'key-1', accountId: 'acc-1', revokedAt: NOW, lastUsedAt: null })
    expect(await service.authenticate(raw, NOW)).toBeNull()
    repo.findKeyByHash.mockResolvedValue(null)
    expect(await service.authenticate(raw, NOW)).toBeNull()
    repo.findKeyByHash.mockClear()
    expect(await service.authenticate('vtz_outra_chave_da_api_publica', NOW)).toBeNull()
    expect(repo.findKeyByHash).not.toHaveBeenCalled()
  })

  it('não falha a chamada se anotar o uso da chave der erro', async () => {
    const repo = makeRepo()
    repo.findKeyByHash.mockResolvedValue({ id: 'key-1', accountId: 'acc-1', revokedAt: null, lastUsedAt: null })
    repo.touchKey.mockRejectedValue(new Error('x'))
    expect(await new AdsConversionsService(repo as never).authenticate('vzc_' + 'b'.repeat(43), NOW)).toEqual(KEY)
  })
})

describe('AdsConversionsService — conversões', () => {
  it('aceita e grava no dia em que a conversão aconteceu (fuso de São Paulo)', async () => {
    const repo = makeRepo()
    const result = await new AdsConversionsService(repo as never).ingest(KEY, [event({ occurredAt: '2026-11-23T01:30:00.000Z' })], NOW)
    expect(result).toEqual({ accepted: 1, duplicates: 0, rejected: 0, results: [{ dedupeKey: 'pedido-1', status: 'ACCEPTED' }] })
    expect(repo.record).toHaveBeenCalledWith(expect.objectContaining({ impressionId: 'imp-1', adId: 'ad-1', adSetId: 'set-1', accountId: 'acc-1', keyId: 'key-1', valueCents: 4990, day: '2026-11-22' }))
  })

  it('sem valor, grava zero', async () => {
    const repo = makeRepo()
    await new AdsConversionsService(repo as never).ingest(KEY, [event({ valueCents: undefined, eventName: 'LEAD' })], NOW)
    expect(repo.record).toHaveBeenCalledWith(expect.objectContaining({ valueCents: 0, eventName: 'LEAD' }))
  })

  it('o mesmo dedupeKey de novo é "repetida" e não grava (nem confere a janela)', async () => {
    const repo = makeRepo()
    repo.conversionExists.mockResolvedValue(true)
    const result = await new AdsConversionsService(repo as never).ingest(KEY, [event({ occurredAt: '2020-01-01T00:00:00.000Z' })], NOW)
    expect(result.results).toEqual([{ dedupeKey: 'pedido-1', status: 'DUPLICATE' }])
    expect(repo.record).not.toHaveBeenCalled()
  })

  it('dois envios ao mesmo tempo: o índice único do banco decide e a segunda vira "repetida"', async () => {
    const repo = makeRepo()
    repo.record.mockResolvedValue(false)
    const result = await new AdsConversionsService(repo as never).ingest(KEY, [event()], NOW)
    expect(result).toMatchObject({ accepted: 0, duplicates: 1 })
  })

  it('clique de outra conta, inexistente, nunca aberto ou mal formado: todos respondem igual (sem pista)', async () => {
    const other = impression({ ad: { adSetId: 's', creative: { destinationUrl: 'https://x.com' }, adSet: { campaign: { accountId: 'outra-conta' } } } })
    const cases = [makeRepo(other), makeRepo(null), makeRepo(impression({ landedAt: null }))]
    for (const repo of cases) {
      const result = await new AdsConversionsService(repo as never).ingest(KEY, [event()], NOW)
      expect(result.results).toEqual([{ dedupeKey: 'pedido-1', status: 'REJECTED', reason: 'UNKNOWN_CLICK' }])
      expect(repo.record).not.toHaveBeenCalled()
    }
    const malformed = await new AdsConversionsService(makeRepo() as never).ingest(KEY, [event({ clickId: 'x' })], NOW)
    expect(malformed.results[0]).toMatchObject({ status: 'REJECTED', reason: 'UNKNOWN_CLICK' })
  })

  it('recusa fora da janela de 7 dias e no futuro, dizendo o motivo', async () => {
    const repo = makeRepo()
    const result = await new AdsConversionsService(repo as never).ingest(
      KEY,
      [event({ dedupeKey: 'tarde', occurredAt: '2026-11-30T12:00:01.000Z' }), event({ dedupeKey: 'cedo', occurredAt: '2026-11-22T11:00:00.000Z' })],
      new Date('2026-12-05T12:00:00.000Z'),
    )
    expect(result.results.map((item) => (item.status === 'REJECTED' ? item.reason : item.status))).toEqual(['OUTSIDE_WINDOW', 'OUTSIDE_WINDOW'])
    const future = await new AdsConversionsService(repo as never).ingest(KEY, [event({ occurredAt: '2026-11-23T12:10:00.000Z' })], NOW)
    expect(future.results[0]).toMatchObject({ status: 'REJECTED', reason: 'IN_THE_FUTURE' })
    expect(repo.record).not.toHaveBeenCalled()
  })

  it('um clique não vira conversões sem fim', async () => {
    const repo = makeRepo()
    repo.countForImpression.mockResolvedValue(AD_CONVERSIONS.MAX_PER_CLICK)
    const result = await new AdsConversionsService(repo as never).ingest(KEY, [event()], NOW)
    expect(result.results[0]).toMatchObject({ status: 'REJECTED', reason: 'TOO_MANY_FOR_CLICK' })
    expect(repo.record).not.toHaveBeenCalled()
  })

  it('um lote mistura resultados e conta cada um', async () => {
    const repo = makeRepo()
    repo.conversionExists.mockImplementation(async (_account: string, key: string) => key === 'velha')
    const result = await new AdsConversionsService(repo as never).ingest(KEY, [event({ dedupeKey: 'nova' }), event({ dedupeKey: 'velha' }), event({ dedupeKey: 'ruim', clickId: 'x' })], NOW)
    expect(result).toMatchObject({ accepted: 1, duplicates: 1, rejected: 1 })
  })
})

describe('AdsConversionsService — chaves no Estúdio', () => {
  it('cria a chave: o texto inteiro vem só na resposta, o banco recebe só o hash', async () => {
    const repo = makeRepo()
    const created = await new AdsConversionsService(repo as never).createKey('co-1', 'acc-1', 'user-1', '  Loja <b>virtual</b>  ')
    expect(created.key.startsWith('vzc_')).toBe(true)
    expect(created.name).toBe('Loja virtual')
    const saved = repo.createKey.mock.calls[0][0] as { keyHash: string; prefix: string }
    expect(saved.keyHash).toBe(hashConversionKey(created.key))
    expect(JSON.stringify(saved)).not.toContain(created.key)
    expect(created.prefix).toBe(created.key.slice(0, 12))
  })

  it('conta de outra empresa não existe para quem pede', async () => {
    const service = new AdsConversionsService(makeRepo() as never)
    await expect(service.createKey('outra', 'acc-1', 'u', 'Loja')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.listKeys('outra', 'acc-1')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.revokeKey('outra', 'acc-1', 'key-1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('tem um limite de chaves ativas por conta', async () => {
    const repo = makeRepo()
    repo.countActiveKeys.mockResolvedValue(AD_CONVERSIONS.MAX_ACTIVE_KEYS)
    await expect(new AdsConversionsService(repo as never).createKey('co-1', 'acc-1', 'u', 'Mais uma')).rejects.toBeInstanceOf(ConflictException)
    expect(repo.createKey).not.toHaveBeenCalled()
  })

  it('revoga uma vez; chave de outra conta não é achada; revogar de novo dá conflito', async () => {
    const repo = makeRepo()
    const service = new AdsConversionsService(repo as never)
    expect(await service.revokeKey('co-1', 'acc-1', 'key-1', NOW)).toEqual({ revoked: true })
    repo.findKey.mockResolvedValue({ id: 'key-9', accountId: 'outra-conta', revokedAt: null })
    await expect(service.revokeKey('co-1', 'acc-1', 'key-9')).rejects.toBeInstanceOf(NotFoundException)
    repo.findKey.mockResolvedValue({ id: 'key-1', accountId: 'acc-1', revokedAt: null })
    repo.revokeKey.mockResolvedValue(false)
    await expect(service.revokeKey('co-1', 'acc-1', 'key-1')).rejects.toBeInstanceOf(ConflictException)
  })
})
