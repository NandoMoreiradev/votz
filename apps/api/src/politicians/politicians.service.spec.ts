import { Test, TestingModule } from '@nestjs/testing'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { OrgPermission, PoliticianStatus } from '@prisma/client'
import { EventType, ReportStatus } from '@votz/shared-types'
import { PoliticiansService } from './politicians.service'
import { PoliticiansRepository } from './politicians.repository'
import { UpdatePoliticianDto } from './dto/update-politician.dto'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { StorageService } from '../storage/storage.service'

const STORAGE_BASE = 'https://cdn.votz.app'

const mockRepo = {
  create: jest.fn(),
  findCities: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  mandatometerStats: jest.fn(),
  monthlyVolume: jest.fn(),
  findReports: jest.fn(),
  update: jest.fn(),
  updateMandatometer: jest.fn(),
}

const mockPrisma = {
  orgMembership: { findFirst: jest.fn() },
  userPoliticianFollower: { findUnique: jest.fn(), delete: jest.fn(), create: jest.fn() },
  politician: { findUnique: jest.fn() },
  report: { findUnique: jest.fn(), update: jest.fn() },
  timelineEvent: { create: jest.fn() },
}

const mockTimeline = { record: jest.fn() }
const mockStorage = {
  assertOwnStorageUrl: jest.fn(
    (url: string, folder?: string, opts?: { allowExternalImageHosts?: boolean }) => {
      if (url.startsWith(`${STORAGE_BASE}/${folder ? `${folder}/` : ''}`)) return
      if (opts?.allowExternalImageHosts && url.startsWith('https://www.camara.leg.br/')) return
      throw new BadRequestException('Envie o arquivo pelo Votz')
    },
  ),
}

describe('PoliticiansService', () => {
  let service: PoliticiansService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoliticiansService,
        { provide: PoliticiansRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TimelineService, useValue: mockTimeline },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile()

    service = module.get(PoliticiansService)
    jest.clearAllMocks()
  })

  describe('findById', () => {
    it('throws NotFoundException when politician does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      mockRepo.mandatometerStats.mockResolvedValue({ total: 0, resolved: 0, open: 0, byStatus: {} })
      mockRepo.monthlyVolume.mockResolvedValue([])
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException)
    })

    it('calculates trustBadge and classification metrics', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'p1', name: 'Ana' })
      mockRepo.mandatometerStats.mockResolvedValue({
        total: 10,
        resolved: 6,
        open: 2,
        byStatus: { DISPUTED: 1 },
      })
      mockRepo.monthlyVolume.mockResolvedValue([])

      const res = await service.findById('p1')
      expect(res.metrics.responseRate).toBe(80)
      expect(res.metrics.resolutionRate).toBe(60)
      expect(res.metrics.trustBadge).toBe(true)
      expect(res.metrics.classification).toBe('Político Ativo')
    })
  })

  describe('update', () => {
    it('throws ForbiddenException without MANAGE_PROFILE permission', async () => {
      mockPrisma.orgMembership.findFirst.mockResolvedValue(null)
      await expect(service.update('p1', 'u1', { name: 'Novo' })).rejects.toThrow(ForbiddenException)
    })

    it('updates politician when authorized', async () => {
      mockPrisma.orgMembership.findFirst.mockResolvedValue({
        role: { permissions: [OrgPermission.MANAGE_PROFILE] },
      })
      mockRepo.update.mockResolvedValue({ id: 'p1', name: 'Novo' })

      const res = await service.update('p1', 'u1', { name: 'Novo' })
      expect(res.name).toBe('Novo')
    })
  })

  describe('followToggle', () => {
    it('unfollows when already following and follows when not', async () => {
      mockPrisma.userPoliticianFollower.findUnique.mockResolvedValueOnce({ id: 'f1' })
      expect(await service.followToggle('p1', 'u1')).toEqual({ following: false })

      mockPrisma.userPoliticianFollower.findUnique.mockResolvedValueOnce(null)
      expect(await service.followToggle('p1', 'u1')).toEqual({ following: true })
    })
  })

  describe('advocate', () => {
    it('rejects advocacy when politician mandate is ENCERRADO', async () => {
      mockPrisma.politician.findUnique.mockResolvedValue({ status: PoliticianStatus.ENCERRADO })
      await expect(service.advocate('p1', 'r1', 'u1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects already resolved reports', async () => {
      mockPrisma.politician.findUnique.mockResolvedValue({ status: PoliticianStatus.ATIVO })
      mockPrisma.orgMembership.findFirst.mockResolvedValue({ id: 'm1' })
      mockPrisma.report.findUnique.mockResolvedValue({
        id: 'r1',
        status: ReportStatus.RESOLVED,
        timeline: [],
      })
      await expect(service.advocate('p1', 'r1', 'u1')).rejects.toThrow(BadRequestException)
    })

    it('rejects duplicate advocacy by the same politician', async () => {
      mockPrisma.politician.findUnique.mockResolvedValue({ status: PoliticianStatus.ATIVO })
      mockPrisma.orgMembership.findFirst.mockResolvedValue({ id: 'm1' })
      mockPrisma.report.findUnique.mockResolvedValue({
        id: 'r1',
        status: ReportStatus.IN_PROGRESS,
        timeline: [{ metadata: { action: 'advocated', politicianId: 'p1' } }],
      })
      await expect(service.advocate('p1', 'r1', 'u1')).rejects.toThrow(ConflictException)
    })

    it('advocates report, moves status to IN_PROGRESS and updates mandatometer', async () => {
      mockPrisma.politician.findUnique.mockResolvedValue({ status: PoliticianStatus.ATIVO })
      mockPrisma.orgMembership.findFirst.mockResolvedValue({ id: 'm1' })
      mockPrisma.report.findUnique.mockResolvedValue({
        id: 'r1',
        status: ReportStatus.OPEN,
        timeline: [],
      })
      mockRepo.mandatometerStats.mockResolvedValue({ total: 1 })

      const res = await service.advocate('p1', 'r1', 'u1')
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
      expect(mockRepo.updateMandatometer).toHaveBeenCalledWith('p1', { total: 1 })
    })
  })

  describe('update avatarUrl & website validation (A4)', () => {
    it('rejects untrusted external or wrong-folder avatarUrl, accepts avatars/ or allowlisted official hosts, and rejects ftp:// website', async () => {
      mockPrisma.orgMembership.findFirst.mockResolvedValue({
        role: { permissions: [OrgPermission.MANAGE_PROFILE] },
      })

      await expect(
        service.update('p1', 'u1', { avatarUrl: 'https://evil.example/a.jpg' }),
      ).rejects.toThrow(BadRequestException)

      await expect(
        service.update('p1', 'u1', { avatarUrl: `${STORAGE_BASE}/reports/wrong.jpg` }),
      ).rejects.toThrow(BadRequestException)

      mockRepo.update.mockResolvedValue({ id: 'p1', avatarUrl: `${STORAGE_BASE}/avatars/ok.jpg` })
      await expect(
        service.update('p1', 'u1', { avatarUrl: `${STORAGE_BASE}/avatars/ok.jpg` }),
      ).resolves.toMatchObject({ avatarUrl: `${STORAGE_BASE}/avatars/ok.jpg` })

      mockRepo.update.mockResolvedValue({ id: 'p1', avatarUrl: 'https://www.camara.leg.br/dep.jpg' })
      await expect(
        service.update('p1', 'u1', { avatarUrl: 'https://www.camara.leg.br/dep.jpg' }),
      ).resolves.toMatchObject({ avatarUrl: 'https://www.camara.leg.br/dep.jpg' })

      const ftpDto = plainToInstance(UpdatePoliticianDto, { website: 'ftp://senado.leg.br' })
      expect(await validate(ftpDto)).not.toHaveLength(0)
    })
  })
})
