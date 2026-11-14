import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { IbgeSyncService, IBGE_SYNC_QUEUE } from './ibge-sync.service'
import { PrismaService } from '../prisma/prisma.service'

const mockQueue = { add: jest.fn() }
const mockPrisma = {
  entity: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
}

describe('IbgeSyncService', () => {
  let service: IbgeSyncService
  const originalFetch = global.fetch

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IbgeSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(IBGE_SYNC_QUEUE), useValue: mockQueue },
      ],
    }).compile()

    service = module.get(IbgeSyncService)
    jest.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('handles Fernando de Noronha (microrregiao null) using regiao-imediata fallback', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 2605459,
          nome: 'Fernando de Noronha',
          microrregiao: null,
          'regiao-imediata': { 'regiao-intermediaria': { UF: { sigla: 'PE' } } },
        },
        {
          id: 3550308,
          nome: 'São Paulo',
          microrregiao: { mesorregiao: { UF: { sigla: 'SP' } } },
        },
      ],
    }) as any

    mockPrisma.entity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ent-sp' })
    mockPrisma.entity.create.mockResolvedValue({})
    mockPrisma.entity.update.mockResolvedValue({})

    const res = await service.runSync()

    expect(res.created).toBe(1)
    expect(res.updated).toBe(1)
    expect(mockPrisma.entity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ibgeCode: '2605459', state: 'PE' }),
      }),
    )
  })
})
