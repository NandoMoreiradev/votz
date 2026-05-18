import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException } from '@nestjs/common'

jest.mock('isomorphic-dompurify', () => ({
  sanitize: (s: string) => s,
}))

import { CommentsService } from './comments.service'
import { CommentsRepository } from './comments.repository'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PressureService } from '../press/pressure.service'

const mockRepo = {
  create: jest.fn(),
  findByReport: jest.fn(),
  findById: jest.fn(),
  delete: jest.fn(),
}

const mockPrismaReport = { findUnique: jest.fn() }
const mockPrisma = { report: mockPrismaReport }
const mockNotifications = { notify: jest.fn() }
const mockPressure = { enqueueReport: jest.fn().mockResolvedValue(undefined) }

function makeComment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'comment-1',
    content: 'Este problema também me afeta.',
    authorId: 'author-1',
    reportId: 'report-1',
    parentId: null,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('CommentsService', () => {
  let service: CommentsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: CommentsRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: PressureService, useValue: mockPressure },
      ],
    }).compile()

    service = module.get<CommentsService>(CommentsService)
    jest.clearAllMocks()
    mockNotifications.notify.mockResolvedValue(undefined)
    mockPressure.enqueueReport.mockResolvedValue(undefined)
  })

  // ──────────────────────────────────────────────
  // create()
  // ──────────────────────────────────────────────

  describe('create', () => {
    const dto = { content: 'Comentário de teste sobre o relato.' }

    it('throws NotFoundException when report does not exist', async () => {
      mockPrismaReport.findUnique.mockResolvedValue(null)
      await expect(service.create('r1', 'u1', dto as any)).rejects.toThrow(NotFoundException)
    })

    it('creates and returns the comment', async () => {
      const report = { id: 'r1', authorId: 'owner-1', title: 'Relato' }
      mockPrismaReport.findUnique.mockResolvedValue(report)
      const comment = makeComment({ reportId: 'r1', authorId: 'u1' })
      mockRepo.create.mockResolvedValue(comment)

      const result = await service.create('r1', 'u1', dto as any)

      expect(result).toEqual(comment)
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reportId: 'r1', authorId: 'u1' }),
      )
    })

    it('notifies the report author when commenter is different', async () => {
      const report = { id: 'r1', authorId: 'owner-1', title: 'Relato' }
      mockPrismaReport.findUnique.mockResolvedValue(report)
      mockRepo.create.mockResolvedValue(makeComment({ id: 'c1' }))

      await service.create('r1', 'commenter-99', dto as any)

      expect(mockNotifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'owner-1', type: 'NEW_COMMENT' }),
      )
    })

    it('does not notify when author comments on their own report', async () => {
      const report = { id: 'r1', authorId: 'owner-1', title: 'Relato' }
      mockPrismaReport.findUnique.mockResolvedValue(report)
      mockRepo.create.mockResolvedValue(makeComment())

      await service.create('r1', 'owner-1', dto as any)

      expect(mockNotifications.notify).not.toHaveBeenCalled()
    })

    it('enqueues pressure recalculation after creating comment', async () => {
      mockPrismaReport.findUnique.mockResolvedValue({ id: 'r1', authorId: null, title: 'T' })
      mockRepo.create.mockResolvedValue(makeComment())

      await service.create('r1', 'u1', dto as any)

      expect(mockPressure.enqueueReport).toHaveBeenCalledWith('r1')
    })
  })

  // ──────────────────────────────────────────────
  // delete()
  // ──────────────────────────────────────────────

  describe('delete', () => {
    it('throws NotFoundException when comment does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.delete('c1', 'u1', 'CITIZEN')).rejects.toThrow(NotFoundException)
    })

    it('throws ForbiddenException when user is not the owner and not a moderator', async () => {
      mockRepo.findById.mockResolvedValue(makeComment({ authorId: 'another-user' }))
      await expect(service.delete('c1', 'u1', 'CITIZEN')).rejects.toThrow(ForbiddenException)
    })

    it('allows the comment owner to delete their comment', async () => {
      const comment = makeComment({ authorId: 'u1' })
      mockRepo.findById.mockResolvedValue(comment)
      mockRepo.delete.mockResolvedValue(comment)

      await service.delete('c1', 'u1', 'CITIZEN')

      expect(mockRepo.delete).toHaveBeenCalledWith('c1')
    })

    it('allows MODERATOR to delete any comment', async () => {
      mockRepo.findById.mockResolvedValue(makeComment({ authorId: 'another-user' }))
      mockRepo.delete.mockResolvedValue({})

      await service.delete('c1', 'moderator-1', 'MODERATOR')

      expect(mockRepo.delete).toHaveBeenCalledWith('c1')
    })

    it('allows ADMIN to delete any comment', async () => {
      mockRepo.findById.mockResolvedValue(makeComment({ authorId: 'another-user' }))
      mockRepo.delete.mockResolvedValue({})

      await service.delete('c1', 'admin-1', 'ADMIN')

      expect(mockRepo.delete).toHaveBeenCalledWith('c1')
    })
  })
})
