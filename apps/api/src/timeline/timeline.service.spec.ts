import { Test, TestingModule } from '@nestjs/testing'
import { EventType } from '@votz/shared-types'
import { TimelineService } from './timeline.service'
import { PrismaService } from '../prisma/prisma.service'

const mockPrisma = {
  timelineEvent: { create: jest.fn(), findMany: jest.fn() },
}

describe('TimelineService', () => {
  let service: TimelineService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimelineService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(TimelineService)
    jest.clearAllMocks()
  })

  it('records immutable timeline event with null authorId fallback', async () => {
    mockPrisma.timelineEvent.create.mockResolvedValue({ id: 't1' })
    await service.record({
      reportId: 'r1',
      type: EventType.CREATED,
      content: 'Criado',
    })
    expect(mockPrisma.timelineEvent.create).toHaveBeenCalledWith({
      data: {
        reportId: 'r1',
        type: EventType.CREATED,
        content: 'Criado',
        authorId: null,
        metadata: undefined,
      },
    })
  })

  it('lists timeline events chronologically', async () => {
    mockPrisma.timelineEvent.findMany.mockResolvedValue([{ id: 't1' }])
    const res = await service.findByReport('r1')
    expect(res).toEqual([{ id: 't1' }])
    expect(mockPrisma.timelineEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reportId: 'r1' },
        orderBy: { createdAt: 'asc' },
      }),
    )
  })
})
