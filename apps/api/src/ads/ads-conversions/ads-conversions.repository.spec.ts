import { AdsConversionsRepository, type ConversionRecord } from './ads-conversions.repository'

const record = (patch: Partial<ConversionRecord> = {}): ConversionRecord => ({
  impressionId: 'imp-1',
  adId: 'ad-1',
  adSetId: 'set-1',
  accountId: 'acc-1',
  keyId: 'key-1',
  source: 'API',
  eventName: 'PURCHASE',
  valueCents: 4990,
  occurredAt: new Date('2026-11-24T12:00:00Z'),
  dedupeKey: 'pedido-1',
  day: '2026-11-24',
  ...patch,
})

function build() {
  const tx = { adConversion: { create: jest.fn().mockResolvedValue({}) }, adDailyStat: { upsert: jest.fn().mockResolvedValue({}) } }
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => Promise<void>) => work(tx)) }
  return { tx, repo: new AdsConversionsRepository(prisma as never) }
}

describe('AdsConversionsRepository.record: onde cada conversão soma no relatório', () => {
  it('conversão do anunciante (API) soma em "conversões", com valor', async () => {
    const { tx, repo } = build()
    await expect(repo.record(record())).resolves.toBe(true)
    expect(tx.adConversion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: 'API', keyId: 'key-1', valueCents: 4990 }) })
    const call = tx.adDailyStat.upsert.mock.calls[0][0]
    expect(call.create).toMatchObject({ conversions: 1, conversionValueCents: BigInt(4990) })
    expect(call.update).toEqual({ conversions: { increment: 1 }, conversionValueCents: { increment: BigInt(4990) } })
    expect(JSON.stringify(call, (_key, value) => (typeof value === 'bigint' ? Number(value) : value))).not.toContain('messageConversations')
  })

  it('conversa iniciada no chat soma só em "conversas iniciadas", sem mexer em conversões nem em valor', async () => {
    const { tx, repo } = build()
    await expect(repo.record(record({ source: 'VOTZ_MESSAGE', keyId: null, eventName: 'CONTACT', valueCents: 0, dedupeKey: 'msg:imp-1' }))).resolves.toBe(true)
    expect(tx.adConversion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: 'VOTZ_MESSAGE', keyId: null, eventName: 'CONTACT' }) })
    const call = tx.adDailyStat.upsert.mock.calls[0][0]
    expect(call.create).toEqual({ adId: 'ad-1', adSetId: 'set-1', day: expect.any(Date), messageConversations: 1 })
    expect(call.update).toEqual({ messageConversations: { increment: 1 } })
  })

  it('a mesma chave de repetição devolve falso (o banco tem índice único)', async () => {
    const { tx, repo } = build()
    const { Prisma } = jest.requireActual('@prisma/client')
    tx.adConversion.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicada', { code: 'P2002', clientVersion: 'test' }))
    await expect(repo.record(record())).resolves.toBe(false)
  })
})
