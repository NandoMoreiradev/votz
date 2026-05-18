import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { VotesService } from './votes.service'
import { VotesRepository } from './votes.repository'
import { PrismaService } from '../prisma/prisma.service'
import { PressureService } from '../press/pressure.service'
import { VoteType } from '@votz/shared-types'

const mockVotesRepo = {
  findExisting: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  findByUser: jest.fn(),
  countByReport: jest.fn(),
}

const mockPrismaReport = { findUnique: jest.fn() }
const mockPrisma = { report: mockPrismaReport }
const mockPressure = { enqueueReport: jest.fn().mockResolvedValue(undefined) }

describe('VotesService', () => {
  let service: VotesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotesService,
        { provide: VotesRepository, useValue: mockVotesRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PressureService, useValue: mockPressure },
      ],
    }).compile()

    service = module.get<VotesService>(VotesService)
    jest.clearAllMocks()
    mockPressure.enqueueReport.mockResolvedValue(undefined)
  })

  // ──────────────────────────────────────────────
  // toggle()
  // ──────────────────────────────────────────────

  describe('toggle', () => {
    it('throws BadRequestException when email is not verified', async () => {
      await expect(
        service.toggle('r1', 'u1', VoteType.SUPPORT, false),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws NotFoundException when report does not exist', async () => {
      mockPrismaReport.findUnique.mockResolvedValue(null)
      await expect(
        service.toggle('r1', 'u1', VoteType.SUPPORT, true),
      ).rejects.toThrow(NotFoundException)
    })

    it('creates a new vote when user has not yet voted', async () => {
      mockPrismaReport.findUnique.mockResolvedValue({ id: 'r1' })
      mockVotesRepo.findExisting.mockResolvedValue(null)

      const result = await service.toggle('r1', 'u1', VoteType.SUPPORT, true)

      expect(mockVotesRepo.create).toHaveBeenCalledWith('r1', 'u1', VoteType.SUPPORT)
      expect(mockVotesRepo.delete).not.toHaveBeenCalled()
      expect(result).toEqual({ voted: true, type: VoteType.SUPPORT })
    })

    it('removes an existing vote (toggle off)', async () => {
      mockPrismaReport.findUnique.mockResolvedValue({ id: 'r1' })
      mockVotesRepo.findExisting.mockResolvedValue({ id: 'vote-1' })

      const result = await service.toggle('r1', 'u1', VoteType.SUPPORT, true)

      expect(mockVotesRepo.delete).toHaveBeenCalledWith('r1', 'u1', VoteType.SUPPORT)
      expect(mockVotesRepo.create).not.toHaveBeenCalled()
      expect(result).toEqual({ voted: false, type: VoteType.SUPPORT })
    })

    it('enqueues pressure recalculation after toggling', async () => {
      mockPrismaReport.findUnique.mockResolvedValue({ id: 'r1' })
      mockVotesRepo.findExisting.mockResolvedValue(null)

      await service.toggle('r1', 'u1', VoteType.ME_TOO, true)

      expect(mockPressure.enqueueReport).toHaveBeenCalledWith('r1')
    })
  })

  // ──────────────────────────────────────────────
  // myVotes()
  // ──────────────────────────────────────────────

  describe('myVotes', () => {
    it('returns false for both types when user has no votes', async () => {
      mockVotesRepo.findByUser.mockResolvedValue([])
      const result = await service.myVotes('r1', 'u1')
      expect(result).toEqual({ SUPPORT: false, ME_TOO: false })
    })

    it('returns true for SUPPORT when user voted SUPPORT', async () => {
      mockVotesRepo.findByUser.mockResolvedValue([{ type: VoteType.SUPPORT }])
      const result = await service.myVotes('r1', 'u1')
      expect(result.SUPPORT).toBe(true)
      expect(result.ME_TOO).toBe(false)
    })

    it('returns true for both types when user voted both', async () => {
      mockVotesRepo.findByUser.mockResolvedValue([
        { type: VoteType.SUPPORT },
        { type: VoteType.ME_TOO },
      ])
      const result = await service.myVotes('r1', 'u1')
      expect(result).toEqual({ SUPPORT: true, ME_TOO: true })
    })
  })

  // ──────────────────────────────────────────────
  // countsByReport()
  // ──────────────────────────────────────────────

  describe('countsByReport', () => {
    it('returns zero counts when no votes exist', async () => {
      mockVotesRepo.countByReport.mockResolvedValue([])
      const result = await service.countsByReport('r1')
      expect(result).toEqual({ SUPPORT: 0, ME_TOO: 0 })
    })

    it('aggregates counts by vote type', async () => {
      mockVotesRepo.countByReport.mockResolvedValue([
        { type: VoteType.SUPPORT, _count: 42 },
        { type: VoteType.ME_TOO, _count: 7 },
      ])
      const result = await service.countsByReport('r1')
      expect(result).toEqual({ SUPPORT: 42, ME_TOO: 7 })
    })
  })
})
