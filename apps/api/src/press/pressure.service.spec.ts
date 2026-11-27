import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { ReportStatus, VoteType } from '@votz/shared-types'
import { PressureService, PRESSURE_QUEUE } from './pressure.service'
import { PrismaService } from '../prisma/prisma.service'

const mockQueue = { add: jest.fn() }
const mockPrisma = {
  report: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  vote: { groupBy: jest.fn() },
  $executeRaw: jest.fn(),
}

describe('PressureService', () => {
  let service: PressureService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PressureService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(PRESSURE_QUEUE), useValue: mockQueue },
      ],
    }).compile()

    service = module.get(PressureService)
    jest.clearAllMocks()
  })

  it('enqueues single report recalculation with deduplicated jobId', async () => {
    mockQueue.add.mockResolvedValue({})
    await service.enqueueReport('r1')
    expect(mockQueue.add).toHaveBeenCalledWith(
      'recalculate-single',
      { reportId: 'r1' },
      expect.objectContaining({ jobId: 'single-r1' }),
    )
  })

  it('skips recalculation for non-active or missing reports', async () => {
    mockPrisma.report.findUnique.mockResolvedValueOnce(null)
    await service.recalculateOne('missing')
    expect(mockPrisma.report.update).not.toHaveBeenCalled()

    // Encerrado sai da disputa por atenção: a pressão zera (e não é recalculada)
    mockPrisma.report.findUnique.mockResolvedValueOnce({ id: 'r1', status: ReportStatus.RESOLVED })
    await service.recalculateOne('r1')
    expect(mockPrisma.report.update).not.toHaveBeenCalled()
    expect(mockPrisma.report.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', pressureScore: { not: 0 } },
      data: { pressureScore: 0 },
    })
  })

  it('relato contestado continua ativo e segue somando pressão', async () => {
    mockPrisma.report.findUnique.mockResolvedValueOnce({
      id: 'r1',
      status: ReportStatus.DISPUTED,
      category: 'HEALTH',
      createdAt: new Date(),
      groupId: null,
      surtoId: null,
      _count: { comments: 0 },
      firstResponseAt: new Date(),
    })
    mockPrisma.vote.groupBy.mockResolvedValue([{ type: VoteType.SUPPORT, _count: { _all: 2 } }])
    await service.recalculateOne('r1')
    expect(mockPrisma.report.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { pressureScore: 3 } })
  })

  it('computes weighted pressureScore with surto similarity and no response penalty', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000 - 1000)
    mockPrisma.report.findUnique.mockResolvedValue({
      id: 'r1',
      status: ReportStatus.OPEN,
      category: 'HEALTH',
      createdAt: twoDaysAgo,
      groupId: null,
      surtoId: 'surto-1',
      _count: { comments: 3 },
      firstResponseAt: null, // quem recebeu não respondeu -> +2 dias * 2 = 4
    })
    mockPrisma.vote.groupBy.mockResolvedValue([
      { type: VoteType.SUPPORT, _count: { _all: 4 } }, // 4 * 1.5 = 6
      { type: VoteType.ME_TOO, _count: { _all: 2 } },  // 2 * 2.5 = 5
    ])
    mockPrisma.report.count.mockResolvedValue(2) // 2 * 3 = 6

    await service.recalculateOne('r1')

    // 6 + 5 + 3 + 4 + 6 = 24
    expect(mockPrisma.report.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { pressureScore: 24 },
    })
  })

  it('returns 0 updated in batch when no active reports exist', async () => {
    mockPrisma.report.findMany.mockResolvedValue([])
    expect(await service.recalculateBatch()).toEqual({ updated: 0 })
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled()
  })

  it('executes batch update for active reports', async () => {
    mockPrisma.report.findMany.mockResolvedValue([
      {
        id: '00000000-0000-0000-0000-000000000001',
        category: 'MOBILITY',
        createdAt: new Date(),
        groupId: 'g1',
        surtoId: null,
        _count: { comments: 1 },
        firstResponseAt: new Date(),
      },
    ])
    mockPrisma.vote.groupBy.mockResolvedValue([
      { reportId: '00000000-0000-0000-0000-000000000001', type: VoteType.SUPPORT, _count: { _all: 2 } },
    ])
    mockPrisma.$executeRaw.mockResolvedValue(1)

    expect(await service.recalculateBatch()).toEqual({ updated: 1 })
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1)
  })
})
