import { Test, TestingModule } from '@nestjs/testing'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { OrgPermission } from '@prisma/client'
import { EventType, ReportStatus } from '@votz/shared-types'
import { EntitiesService } from './entities.service'
import { EntitiesRepository } from './entities.repository'
import { CreateEntityDto } from './dto/create-entity.dto'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'

const STORAGE_BASE = 'https://cdn.votz.app'

const mockRepo = {
  create: jest.fn(),
  findCities: jest.fn(),
  findAll: jest.fn(),
  findByIdFull: jest.fn(),
  stats: jest.fn(),
  monthlyVolume: jest.fn(),
  findReports: jest.fn(),
  update: jest.fn(),
}

const mockPrisma = {
  orgMembership: { findFirst: jest.fn(), findUnique: jest.fn() },
  report: { findUnique: jest.fn(), update: jest.fn() },
  timelineEvent: { create: jest.fn() },
}

const entityActingUser = {
  id: 'u1',
  type: 'CITIZEN',
  ctx: {
    type: 'ENTITY' as const,
    id: 'e1',
    name: 'Pref',
    logoUrl: null,
    permissions: [OrgPermission.RESPOND_REPORTS],
  },
}

const mockStorage = {
  assertOwnStorageUrl: jest.fn((url: string, folder?: string) => {
    if (!url.startsWith(`${STORAGE_BASE}/${folder ? `${folder}/` : ''}`)) {
      throw new BadRequestException('Envie o arquivo pelo Votz')
    }
  }),
}

describe('EntitiesService', () => {
  let service: EntitiesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitiesService,
        { provide: EntitiesRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile()

    service = module.get(EntitiesService)
    jest.clearAllMocks()
  })

  it('strips formatting from CNPJ on register', async () => {
    mockRepo.create.mockResolvedValue({ id: 'e1' })
    await service.register('u1', { legalName: 'Pref', cnpj: '46.395.000/0001-39' } as any)
    expect(mockRepo.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ cnpj: '46395000000139' }),
    )
  })

  it('computes entity metrics and classification on findById', async () => {
    mockRepo.findByIdFull.mockResolvedValue({ id: 'e1', legalName: 'Prefeitura' })
    mockRepo.stats.mockResolvedValue({
      total: 10,
      resolved: 7,
      byStatus: { OPEN: 1, DISPUTED: 1 },
    })
    mockRepo.monthlyVolume.mockResolvedValue([])

    const res = await service.findById('e1')
    expect(res.metrics.responseRate).toBe(90)
    expect(res.metrics.resolutionRate).toBe(70)
    expect(res.metrics.trustBadge).toBe(true)
    expect(res.metrics.classification).toBe('Entidade Comprometida')
  })

  it('throws NotFoundException when entity does not exist', async () => {
    mockRepo.findByIdFull.mockResolvedValue(null)
    mockRepo.stats.mockResolvedValue({ total: 0, resolved: 0, byStatus: {} })
    mockRepo.monthlyVolume.mockResolvedValue([])
    await expect(service.findById('missing')).rejects.toThrow(NotFoundException)
  })

  it('enforces MANAGE_PROFILE permission on update', async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue({ role: { permissions: [] } })
    await expect(service.update('e1', 'u1', { city: 'Campinas' } as any)).rejects.toThrow(
      ForbiddenException,
    )

    mockPrisma.orgMembership.findFirst.mockResolvedValue({
      role: { permissions: [OrgPermission.MANAGE_PROFILE] },
    })
    mockRepo.update.mockResolvedValue({ id: 'e1' })
    await service.update('e1', 'u1', { city: 'Campinas' } as any)
    expect(mockRepo.update).toHaveBeenCalled()
  })

  it('handles advocate validations and transitions report to IN_PROGRESS', async () => {
    await expect(service.advocate('e1', 'r1', { id: 'u1', type: 'ENTITY', ctx: null })).rejects.toThrow(
      ForbiddenException,
    )

    mockPrisma.orgMembership.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      role: { permissions: [OrgPermission.RESPOND_REPORTS] },
    })
    mockPrisma.report.findUnique.mockResolvedValueOnce({
      id: 'r1',
      status: ReportStatus.RESOLVED,
      timeline: [],
    })
    await expect(service.advocate('e1', 'r1', entityActingUser)).rejects.toThrow(BadRequestException)

    mockPrisma.report.findUnique.mockResolvedValueOnce({
      id: 'r1',
      status: ReportStatus.IN_PROGRESS,
      timeline: [{ metadata: { action: 'advocated', entityId: 'e1' } }],
    })
    await expect(service.advocate('e1', 'r1', entityActingUser)).rejects.toThrow(ConflictException)

    mockPrisma.report.findUnique.mockResolvedValueOnce({
      id: 'r1',
      status: ReportStatus.OPEN,
      timeline: [],
    })
    const res = await service.advocate('e1', 'r1', entityActingUser)
    expect(res).toEqual({ advocated: true })
    expect(mockPrisma.report.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: ReportStatus.IN_PROGRESS },
    })
    expect(mockPrisma.timelineEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: EventType.RESPONDED }),
      }),
    )
  })

  it('rejects external or wrong-folder logoUrl and ftp:// website on entity', async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue({
      role: { permissions: [OrgPermission.MANAGE_PROFILE] },
    })

    await expect(
      service.update('e1', 'u1', { logoUrl: 'https://evil.example/logo.png' }),
    ).rejects.toThrow(BadRequestException)

    await expect(
      service.update('e1', 'u1', { logoUrl: `${STORAGE_BASE}/reports/wrong.png` }),
    ).rejects.toThrow(BadRequestException)

    mockRepo.update.mockResolvedValue({ id: 'e1', logoUrl: `${STORAGE_BASE}/entities/logo.png` })
    await expect(
      service.update('e1', 'u1', { logoUrl: `${STORAGE_BASE}/entities/logo.png` }),
    ).resolves.toMatchObject({ logoUrl: `${STORAGE_BASE}/entities/logo.png` })

    const ftpDto = plainToInstance(CreateEntityDto, {
      legalName: 'Prefeitura Municipal',
      cnpj: '46395000000139',
      type: 'PUBLIC_AGENCY',
      website: 'ftp://prefeitura.sp.gov.br',
    })
    expect(await validate(ftpDto)).not.toHaveLength(0)
  })
})
