import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { CamaraSyncService, CAMARA_SYNC_QUEUE } from './camara-sync.service'
import { PrismaService } from '../prisma/prisma.service'

const mockQueue = { add: jest.fn() }
const mockPrisma = {
  party: { upsert: jest.fn(), findMany: jest.fn() },
  politician: { findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
}

describe('CamaraSyncService', () => {
  let service: CamaraSyncService
  const originalFetch = global.fetch

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CamaraSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(CAMARA_SYNC_QUEUE), useValue: mockQueue },
      ],
    }).compile()

    service = module.get(CamaraSyncService)
    jest.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('enqueues sync job with optional legislaturaId', async () => {
    mockQueue.add.mockResolvedValue({})
    await service.triggerSync(58)
    expect(mockQueue.add).toHaveBeenCalledWith(
      'full-sync',
      { legislaturaId: 58 },
      expect.objectContaining({ jobId: 'camara-full-sync-58' }),
    )
  })

  it('resolves active legislature dynamically and reconciles pre-imported TSE deputies', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/partidos')) {
        return {
          ok: true,
          json: async () => ({
            dados: [{ id: 36844, sigla: 'PT', nome: 'Partido dos Trabalhadores' }],
            links: [],
          }),
        }
      }
      if (url.includes('/legislaturas')) {
        return {
          ok: true,
          json: async () => ({
            dados: [
              { id: 58, dataInicio: '2027-02-01', dataFim: '2031-01-31' },
              { id: 57, dataInicio: '2023-02-01', dataFim: '2027-01-31' },
            ],
          }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          dados: [
            {
              id: 220001,
              nome: 'Ana Paula',
              siglaPartido: 'PT',
              siglaUf: 'SP',
              urlFoto: 'https://camara.leg.br/ana.jpg',
            },
            {
              id: 220002,
              nome: 'Bruno Costa',
              siglaPartido: 'SEM_PARTIDO',
              siglaUf: 'RJ',
              urlFoto: '',
            },
          ],
          links: [],
        }),
      }
    }) as any

    mockPrisma.party.upsert.mockResolvedValue({})
    mockPrisma.party.findMany.mockResolvedValue([{ id: 'p-pt', abbreviation: 'PT' }])
    mockPrisma.politician.findMany.mockResolvedValue([
      {
        id: 'pol-ana-tse',
        tseId: 'TSE-999111',
        name: 'ANA PAULA',
        state: 'SP',
        office: 'Deputado Federal',
        termStart: new Date('2027-02-01T00:00:00Z'),
        termEnd: new Date('2031-01-31T23:59:59Z'),
        avatarUrl: null,
      },
    ])
    mockPrisma.politician.update.mockResolvedValue({
      id: 'pol-ana-tse',
      tseId: '220001',
      termStart: new Date('2027-02-01T00:00:00Z'),
      termEnd: new Date('2031-01-31T23:59:59Z'),
      avatarUrl: 'https://camara.leg.br/ana.jpg',
    })

    const res = await service.runSync(58)

    expect(res.legislaturaId).toBe(58)
    expect(res.parties).toBe(1)
    expect(res.updated).toBe(1) // Ana reconciliada sem criar duplicata!
    expect(res.skipped).toBe(1) // Bruno sem partido
    expect(mockPrisma.politician.create).not.toHaveBeenCalled()
    expect(mockPrisma.politician.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pol-ana-tse' },
        data: expect.objectContaining({ tseId: '220001' }),
      }),
    )
  })
})
