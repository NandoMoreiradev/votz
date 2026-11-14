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
import { TranscriptionService } from '../transcription/transcription.service'
import { StorageService } from '../storage/storage.service'
import { MailService } from '../mail/mail.service'

const mockRepo = {
  create: jest.fn(),
  findByReport: jest.fn(),
  findById: jest.fn(),
  delete: jest.fn(),
  deleteWithAudit: jest.fn(),
}

const mockPrismaReport = { findUnique: jest.fn() }
const mockModerationAction = { update: jest.fn() }
const mockPrisma = { report: mockPrismaReport, moderationAction: mockModerationAction }
const mockNotifications = { notify: jest.fn() }
const mockPressure = { enqueueReport: jest.fn().mockResolvedValue(undefined) }
const mockTranscription = { enqueue: jest.fn().mockResolvedValue(undefined) }
const mockStorage = { delete: jest.fn().mockResolvedValue(undefined) }
const mockMail = { sendModerationNotice: jest.fn().mockResolvedValue(true) }

function makeComment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'comment-1',
    content: 'Este problema também me afeta.',
    authorId: 'author-1',
    mediaKey: null,
    author: { name: 'Ana', email: 'ana@votz.app' },
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
        { provide: TranscriptionService, useValue: mockTranscription },
        { provide: StorageService, useValue: mockStorage },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile()

    service = module.get<CommentsService>(CommentsService)
    jest.clearAllMocks()
    mockNotifications.notify.mockResolvedValue(undefined)
    mockPressure.enqueueReport.mockResolvedValue(undefined)
    mockStorage.delete.mockResolvedValue(undefined)
    mockMail.sendModerationNotice.mockResolvedValue(true)
    mockModerationAction.update.mockResolvedValue({ id: 'act-1', notifiedAt: new Date() })
    mockRepo.deleteWithAudit.mockResolvedValue({ actionId: 'act-1' })
  })

  // ──────────────────────────────────────────────
  // create()
  // ──────────────────────────────────────────────

  describe('create', () => {
    const dto = { content: 'Comentário de teste sobre o relato.' }

    it('throws NotFoundException when report does not exist', async () => {
      mockPrismaReport.findUnique.mockResolvedValue(null)
      await expect(service.create('r1', 'u1', 'CITIZEN', dto as any)).rejects.toThrow(NotFoundException)
    })

    it('creates and returns the comment', async () => {
      const report = { id: 'r1', authorId: 'owner-1', title: 'Relato' }
      mockPrismaReport.findUnique.mockResolvedValue(report)
      const comment = makeComment({ reportId: 'r1', authorId: 'u1' })
      mockRepo.create.mockResolvedValue(comment)

      const result = await service.create('r1', 'u1', 'CITIZEN', dto as any)

      expect(result).toEqual(comment)
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reportId: 'r1', authorId: 'u1' }),
      )
    })

    it('notifies the report author when commenter is different', async () => {
      const report = { id: 'r1', authorId: 'owner-1', title: 'Relato' }
      mockPrismaReport.findUnique.mockResolvedValue(report)
      mockRepo.create.mockResolvedValue(makeComment({ id: 'c1' }))

      await service.create('r1', 'commenter-99', 'CITIZEN', dto as any)

      expect(mockNotifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'owner-1', type: 'NEW_COMMENT' }),
      )
    })

    it('does not notify when author comments on their own report', async () => {
      const report = { id: 'r1', authorId: 'owner-1', title: 'Relato' }
      mockPrismaReport.findUnique.mockResolvedValue(report)
      mockRepo.create.mockResolvedValue(makeComment())

      await service.create('r1', 'owner-1', 'CITIZEN', dto as any)

      expect(mockNotifications.notify).not.toHaveBeenCalled()
    })

    it('enqueues pressure recalculation after creating comment', async () => {
      mockPrismaReport.findUnique.mockResolvedValue({ id: 'r1', authorId: null, title: 'T' })
      mockRepo.create.mockResolvedValue(makeComment())

      await service.create('r1', 'u1', 'CITIZEN', dto as any)

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

    it('allows the comment owner to delete their comment without audit or moderation email', async () => {
      const comment = makeComment({ authorId: 'u1', mediaKey: 'comments/voice-own.webm' })
      mockRepo.findById.mockResolvedValue(comment)
      mockRepo.delete.mockResolvedValue(comment)

      await service.delete('c1', 'u1', 'CITIZEN')

      expect(mockRepo.delete).toHaveBeenCalledWith('c1')
      expect(mockRepo.deleteWithAudit).not.toHaveBeenCalled()
      expect(mockStorage.delete).toHaveBeenCalledWith('comments/voice-own.webm')
      expect(mockMail.sendModerationNotice).not.toHaveBeenCalled()
    })

    it('allows MODERATOR to delete any comment, records ModerationAction, cleans R2 audio, and notifies author', async () => {
      mockRepo.findById.mockResolvedValue(
        makeComment({
          authorId: 'another-user',
          mediaKey: 'comments/voice-bad.webm',
          author: { name: 'João', email: 'joao@votz.app' },
        }),
      )

      await service.delete('c1', 'moderator-1', 'MODERATOR')

      expect(mockRepo.deleteWithAudit).toHaveBeenCalledWith(
        'c1',
        'moderator-1',
        'Removido pela moderação',
      )
      expect(mockStorage.delete).toHaveBeenCalledWith('comments/voice-bad.webm')
      expect(mockMail.sendModerationNotice).toHaveBeenCalledWith(
        'joao@votz.app',
        'João',
        'COMMENT_REMOVED',
        'Removido pela moderação',
      )
      expect(mockModerationAction.update).toHaveBeenCalledWith({
        where: { id: 'act-1' },
        data: { notifiedAt: expect.any(Date) },
      })
    })

    it('allows ADMIN to delete any comment with custom reason and survives email failure', async () => {
      mockRepo.findById.mockResolvedValue(
        makeComment({
          authorId: 'another-user',
          author: { name: 'João', email: 'joao@votz.app' },
        }),
      )
      mockMail.sendModerationNotice.mockResolvedValueOnce(false)

      await expect(
        service.delete('c1', 'admin-1', 'ADMIN', 'Ofensa direta a outro cidadão.'),
      ).resolves.toEqual({ deleted: true })

      expect(mockRepo.deleteWithAudit).toHaveBeenCalledWith(
        'c1',
        'admin-1',
        'Ofensa direta a outro cidadão.',
      )
      expect(mockModerationAction.update).not.toHaveBeenCalled()
    })
  })
})
