import { Test, TestingModule } from '@nestjs/testing'
import { PartiesService } from './parties.service'
import { PrismaService } from '../prisma/prisma.service'

const mockPrisma = {
  party: { findMany: jest.fn() },
}

describe('PartiesService', () => {
  let service: PartiesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartiesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(PartiesService)
    jest.clearAllMocks()
  })

  it('lists active parties ordered by abbreviation', async () => {
    mockPrisma.party.findMany.mockResolvedValue([{ id: '1', abbreviation: 'MDB' }])
    const res = await service.findAll()
    expect(res).toHaveLength(1)
    expect(mockPrisma.party.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true },
        orderBy: { abbreviation: 'asc' },
      }),
    )
  })
})
