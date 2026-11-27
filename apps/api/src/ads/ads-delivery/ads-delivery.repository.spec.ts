import { AdsDeliveryRepository, type EventEffect } from './ads-delivery.repository'

const now = new Date('2026-11-27T15:00:00Z')
const event: EventEffect = {
  eventId: 'event', impressionId: 'impression', adId: 'ad', adSetId: 'set',
  accountId: 'account', companyId: 'company', userId: 'user',
  type: 'VIEWABLE_IMPRESSION', occurredAt: now, visibleMs: 1000,
  status: 'ACCEPTED', reason: null, now, day: '2026-11-27',
}

function setup() {
  const account = { id: 'account', balanceCents: 500, pendingSpendMillicents: 20_600 }
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: account.id }]),
    adAccount: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(account),
      update: jest.fn().mockResolvedValue(account),
    },
    adCampaign: { updateMany: jest.fn() },
    adDailyStat: { upsert: jest.fn() },
    adEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    adImpression: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ chargeOn: 'VIEWABLE_IMPRESSION', chargeMillicents: 600 }),
    },
  }
  const prisma = { $transaction: (run: (tx: typeof transaction) => unknown) => run(transaction) }
  const billing = { postLedger: jest.fn() }
  return { repo: new AdsDeliveryRepository(prisma as never, billing as never), transaction, billing }
}

it('increments visibility and spend on insert as well as update', async () => {
  const { repo, transaction } = setup()
  await repo.applyEvent(event)

  expect(transaction.adDailyStat.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
    create: expect.objectContaining({ viewableImpressions: 1 }),
    update: { viewableImpressions: { increment: 1 } },
  }))
  expect(transaction.adDailyStat.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
    create: expect.objectContaining({ spendMillicents: 600 }),
    update: { spendMillicents: { increment: 600 } },
  }))
})

it('locks the account before reading the pending balance and preserves fractional spend', async () => {
  const { repo, transaction, billing } = setup()
  await repo.closeSpend('account')

  const [sql, accountId] = transaction.$queryRaw.mock.calls[0]
  expect(sql.join('')).toMatch(/FOR UPDATE$/)
  expect(accountId).toBe('account')
  expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    transaction.adAccount.findUniqueOrThrow.mock.invocationCallOrder[0],
  )
  expect(billing.postLedger).toHaveBeenCalledWith(transaction, expect.objectContaining({
    adAccountId: 'account', type: 'SPEND', minBalanceBeforeCents: 20,
  }))
  expect(transaction.adAccount.update).toHaveBeenCalledWith({
    where: { id: 'account' }, data: { pendingSpendMillicents: 600 },
  })
})
