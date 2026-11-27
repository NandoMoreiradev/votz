import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'
import { PoliticianStatus, ReportStatus } from '@prisma/client'
import { MandateExpiryService, MANDATE_EXPIRY_QUEUE } from './mandate-expiry.service'
import { PrismaService } from '../prisma/prisma.service'
import { MandatometerService } from '../report-lifecycle/mandatometer.service'

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
  report: { updateMany: jest.fn() },
  reportAdvocacy: { update: jest.fn() },
  politician: { update: jest.fn() },
}

const mockPrisma = {
  politician: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  report: { findMany: jest.fn() },
  reportAdvocacy: { findMany: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockTx)),
}
const mockMandatometer = { freeze: jest.fn() }

describe('MandateExpiryService', () => {
  let service: MandateExpiryService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MandateExpiryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getQueueToken(MANDATE_EXPIRY_QUEUE), useValue: mockQueue },
        { provide: MandatometerService, useValue: mockMandatometer },
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
    mockPrisma.report.findMany.mockResolvedValue([{ id: 'rep-1', status: ReportStatus.IN_PROGRESS }])
    mockPrisma.reportAdvocacy.findMany.mockResolvedValue([
      // Avocou o próprio relato recebido (sem solução)
      { id: 'adv-1', reportId: 'rep-1', report: { status: ReportStatus.IN_PROGRESS } },
      // Avocou relato de outro órgão, ainda sem solução
      { id: 'adv-2', reportId: 'rep-2', report: { status: ReportStatus.OPEN } },
      // Avocou relato que já foi resolvido
      { id: 'adv-3', reportId: 'rep-3', report: { status: ReportStatus.RESOLVED } },
    ])
    mockTx.report.updateMany.mockResolvedValue({ count: 1 })
    mockSubscriptionsCancel.mockResolvedValue({})

    const res = await service.processExpiredMandates()

    expect(res.processed).toBe(1)
    // Relato recebido volta para Aberto, com evento de mudança de status na Memória
    expect(mockTx.report.updateMany).toHaveBeenCalledWith({
      where: { id: 'rep-1', status: ReportStatus.IN_PROGRESS },
      data: { status: ReportStatus.OPEN },
    })
    const events = mockTx.timelineEvent.create.mock.calls.map((c: any[]) => c[0].data)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reportId: 'rep-1', metadata: expect.objectContaining({ action: 'mandate_ended_unresolved_commitment' }) }),
        expect.objectContaining({ reportId: 'rep-1', type: 'STATUS_CHANGED', metadata: expect.objectContaining({ previousStatus: 'IN_PROGRESS', newStatus: 'OPEN' }) }),
        expect.objectContaining({ reportId: 'rep-2', metadata: expect.objectContaining({ action: 'mandate_ended_unresolved_commitment' }) }),
      ]),
    )
    expect(events.some((e: any) => e.reportId === 'rep-3')).toBe(false)
    // Compromissos: sem solução vira "abandonado"; resolvido fica fechado sem penalidade
    expect(mockTx.reportAdvocacy.update).toHaveBeenCalledWith({ where: { id: 'adv-1' }, data: expect.objectContaining({ closedReason: 'MANDATE_ENDED' }) })
    expect(mockTx.reportAdvocacy.update).toHaveBeenCalledWith({ where: { id: 'adv-2' }, data: expect.objectContaining({ closedReason: 'MANDATE_ENDED' }) })
    expect(mockTx.reportAdvocacy.update).toHaveBeenCalledWith({ where: { id: 'adv-3' }, data: expect.objectContaining({ closedReason: null }) })
    expect(mockMandatometer.freeze).toHaveBeenCalledWith('pol-1')
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
