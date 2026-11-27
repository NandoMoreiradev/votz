import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { OrgPermission, PoliticianStatus } from '@prisma/client'

jest.mock('isomorphic-dompurify', () => ({
  sanitize: (s: string) => s,
}))

import { PoliticiansService } from './politicians.service'
import { PoliticiansRepository } from './politicians.repository'
import { UpdatePoliticianDto } from './dto/update-politician.dto'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { StorageService } from '../storage/storage.service'
import { ReportLifecycleService } from '../report-lifecycle/report-lifecycle.service'
import { MandatometerService, MandatometerSnapshot } from '../report-lifecycle/mandatometer.service'

const STORAGE_BASE = 'https://cdn.votz.app'

const mockRepo = {
  create: jest.fn(),
  findCities: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  mandatometerStats: jest.fn(),
  monthlyVolume: jest.fn(),
  countFollowers: jest.fn().mockResolvedValue(0),
  findReports: jest.fn(),
  update: jest.fn(),
  updateMandatometer: jest.fn(),
}

const mockPrisma = {
  orgMembership: { findFirst: jest.fn(), findUnique: jest.fn() },
  userPoliticianFollower: { findUnique: jest.fn(), delete: jest.fn(), create: jest.fn() },
  politician: { findUnique: jest.fn() },
  report: { findUnique: jest.fn(), update: jest.fn() },
  timelineEvent: { create: jest.fn() },
}

const polActingUser = {
  id: 'u1',
  type: 'CITIZEN',
  ctx: {
    type: 'POLITICIAN' as const,
    id: 'p1',
    name: 'Pol',
    logoUrl: null,
    permissions: [OrgPermission.RESPOND_REPORTS],
  },
}

const mockTimeline = { record: jest.fn() }
const mockLifecycle = { advocate: jest.fn().mockResolvedValue({ advocated: true }) }
const realMandatometer = new MandatometerService(null as any)
const mockMandatometer = {
  compute: jest.fn(),
  metrics: (s: MandatometerSnapshot) => realMandatometer.metrics(s),
}
const snapshot = (o: Partial<MandatometerSnapshot>): MandatometerSnapshot => ({
  total: 0, open: 0, inProgress: 0, resolved: 0, disputed: 0, archived: 0, responded: 0, confirmed: 0,
  everDisputed: 0, disputesUpheld: 0, closedEver: 0, byStatus: {}, byCategory: [],
  commitments: { total: 0, fulfilled: 0, inProgress: 0, overdue: 0, withdrawn: 0, abandoned: 0 },
  advocated: 0, computedAt: new Date().toISOString(),
  ...o,
})
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
        { provide: ReportLifecycleService, useValue: mockLifecycle },
        { provide: MandatometerService, useValue: mockMandatometer },
      ],
    }).compile()

    service = module.get(PoliticiansService)
    jest.clearAllMocks()
  })

  describe('findById', () => {
    it('throws NotFoundException when politician does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      mockRepo.monthlyVolume.mockResolvedValue([])
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException)
    })

    it('calculates trustBadge and classification metrics from the live Mandatômetro', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'p1', name: 'Ana', status: PoliticianStatus.ATIVO })
      mockRepo.monthlyVolume.mockResolvedValue([])
      mockMandatometer.compute.mockResolvedValue(snapshot({ total: 10, responded: 8, resolved: 6, everDisputed: 1, closedEver: 7 }))

      const res = await service.findById('p1')
      expect(mockMandatometer.compute).toHaveBeenCalledWith('p1')
      expect(res.metrics.responseRate).toBe(80)
      expect(res.metrics.resolutionRate).toBe(60)
      expect(res.metrics.trustBadge).toBe(true)
      expect(res.metrics.classification).toBe('Político Ativo')
    })

    it('mandato encerrado mostra o retrato congelado, sem recalcular', async () => {
      const frozen = { ...snapshot({ total: 4, resolved: 1 }), frozenAt: '2026-01-01T00:00:00.000Z' }
      mockRepo.findById.mockResolvedValue({ id: 'p1', name: 'Ana', status: PoliticianStatus.ENCERRADO, mandatometer: frozen })
      mockRepo.monthlyVolume.mockResolvedValue([])
      const res = await service.findById('p1')
      expect(mockMandatometer.compute).not.toHaveBeenCalled()
      expect(res.mandatometer).toEqual(frozen)
    })

    it('inclui o número de seguidores do político', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'p1', name: 'Ana', status: PoliticianStatus.ATIVO })
      mockRepo.monthlyVolume.mockResolvedValue([])
      mockMandatometer.compute.mockResolvedValue(snapshot({}))
      mockRepo.countFollowers.mockResolvedValueOnce(7)
      await expect(service.findById('p1')).resolves.toMatchObject({ followersCount: 7 })
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
    it('passa para o ciclo de vida do relato com o político certo', async () => {
      const dto = { message: 'Vou cobrar a prefeitura.', promisedInDays: 30 }
      await service.advocate('p1', 'r1', polActingUser, dto as any)
      expect(mockLifecycle.advocate).toHaveBeenCalledWith('r1', polActingUser, { orgType: 'POLITICIAN', orgId: 'p1' }, dto)
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
