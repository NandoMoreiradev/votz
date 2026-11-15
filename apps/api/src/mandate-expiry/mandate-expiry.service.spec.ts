import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'
import { PoliticianStatus, ReportStatus } from '@prisma/client'
import { MandateExpiryService, MANDATE_EXPIRY_QUEUE } from './mandate-expiry.service'
import { PrismaService } from '../prisma/prisma.service'

const mockSubscriptionsCancel = jest.fn()
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    subscriptions: { cancel: mockSubscriptionsCancel },
  }))
})

const mockQueue = { add: jest.fn() }
const mockConfig = { getOrThrow: jest.fn().mockReturnValue('sk_test_123') }

const mockTx = {
  timelineEvent: { create: jest.fn() },
  report: { update: jest.fn() },
  politician: { update: jest.fn() },
}

const mockPrisma = {
  politician: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  report: { findMany: jest.fn(), groupBy: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockTx)),
}

describe('MandateExpiryService', () => {
  let service: MandateExpiryService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MandateExpiryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getQueueToken(MANDATE_EXPIRY_QUEUE), useValue: mockQueue },
      ],
    }).compile()

    service = module.get(MandateExpiryService)
    jest.clearAllMocks()
    mockConfig.getOrThrow.mockReturnValue('sk_test_123')
  })

  it('closes expired mandates, reopens IN_PROGRESS reports, freezes mandatometer and cancels Stripe', async () => {
    mockPrisma.politician.findMany.mockResolvedValue([
      { id: 'pol-1', name: 'Fulano', plan: 'MANDATO_PRO', stripeSubscriptionId: 'sub_1' },
    ])
    mockPrisma.report.findMany.mockResolvedValue([
      {
        id: 'rep-1',
        status: ReportStatus.IN_PROGRESS,
        timeline: [{ metadata: { action: 'advocated', politicianId: 'pol-1' } }],
      },
    ])
    mockPrisma.report.groupBy
      .mockResolvedValueOnce([{ status: 'OPEN', _count: 1 }])
      .mockResolvedValueOnce([{ category: 'HEALTH', _count: 1 }])
    mockSubscriptionsCancel.mockResolvedValue({})

    const res = await service.processExpiredMandates()

    expect(res.processed).toBe(1)
    expect(mockTx.report.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: { status: ReportStatus.OPEN },
    })
    expect(mockTx.politician.update).toHaveBeenCalledWith({
      where: { id: 'pol-1' },
      data: { status: PoliticianStatus.ENCERRADO },
    })
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_1')
  })

  it('reactivates politicians whose termEnd was extended into the future', async () => {
    mockPrisma.politician.updateMany.mockResolvedValue({ count: 12 })
    const res = await service.reactivateElectedPoliticians()
    expect(res).toEqual({ reactivated: 12 })
  })
})
