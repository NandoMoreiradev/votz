import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { ImprensaService } from './imprensa.service'
import { ImprensaRepository } from './imprensa.repository'
import { PrismaService } from '../prisma/prisma.service'

const mockRepo = {
  getResumo: jest.fn(),
  getTendencias: jest.fn(),
  getRelatosDestaque: jest.fn(),
  getEntidadesRanking: jest.fn(),
  getSurtosAtivos: jest.fn(),
  getReportsForExport: jest.fn(),
}

const mockPrisma = {
  user: { findUnique: jest.fn() },
}

describe('ImprensaService', () => {
  let service: ImprensaService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImprensaService,
        { provide: ImprensaRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(ImprensaService)
    jest.clearAllMocks()
  })

  it('clamps tendencias days between 7 and 365', () => {
    service.getTendencias(2)
    expect(mockRepo.getTendencias).toHaveBeenCalledWith(7)

    service.getTendencias(999)
    expect(mockRepo.getTendencias).toHaveBeenCalledWith(365)
  })

  it('rejects CSV export for non-verified or non-PRESS users', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ type: 'CITIZEN', verified: true })
    await expect(service.exportCsv('u1')).rejects.toThrow(ForbiddenException)

    mockPrisma.user.findUnique.mockResolvedValue({ type: 'PRESS', verified: false })
    await expect(service.exportCsv('u1')).rejects.toThrow(ForbiddenException)
  })

  it('exports escaped CSV for verified PRESS user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ type: 'PRESS', verified: true })
    mockRepo.getReportsForExport.mockResolvedValue([
      {
        id: 'r1',
        title: 'Buraco "enorme"',
        category: 'MOBILITY',
        status: 'OPEN',
        city: 'São Paulo',
        state: 'SP',
        neighborhood: 'Centro',
        pressureScore: 12.5,
        _count: { votes: 4, comments: 1 },
        createdAt: new Date('2026-10-01T12:00:00Z'),
      },
    ])

    const res = await service.exportCsv('u1', 30, 'SP', 'São Paulo')
    expect(res.filename).toContain('-sp-são-paulo.csv')
    expect(res.csv).toContain('"Buraco ""enorme"""')
    expect(res.csv).toContain('12.50')
  })
})
