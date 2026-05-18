import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (s: string) => s },
}))

import { ReportsService } from './reports.service'
import { ReportsRepository } from './reports.repository'
import { TimelineService } from '../timeline/timeline.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AlertsService } from '../alerts/alerts.service'
import { ReportStatus, EventType } from '@votz/shared-types'
import { DisputeResolution } from './dto/resolve-dispute.dto'
import { UpdatableStatus } from './dto/update-status.dto'

const mockRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
  updateStatus: jest.fn(),
  findAuthorId: jest.fn(),
  setDisputed: jest.fn(),
  resolveDispute: jest.fn(),
}

const mockTimeline = { record: jest.fn() }
const mockNotifications = { notify: jest.fn() }
const mockAlerts = { enqueueCheck: jest.fn() }

function makeReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'report-1',
    title: 'Buraco na rua principal',
    description: 'Buraco grande causando acidentes.',
    status: ReportStatus.OPEN,
    anonymous: false,
    author: { id: 'author-1', name: 'Cidadão', avatarUrl: null },
    timeline: [] as Array<{ id: string; type: string; content: string; createdAt: Date }>,
    ...overrides,
  }
}

describe('ReportsService', () => {
  let service: ReportsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ReportsRepository, useValue: mockRepo },
        { provide: TimelineService, useValue: mockTimeline },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: AlertsService, useValue: mockAlerts },
      ],
    }).compile()

    service = module.get<ReportsService>(ReportsService)
    jest.clearAllMocks()
    mockNotifications.notify.mockResolvedValue(undefined)
    mockTimeline.record.mockResolvedValue(undefined)
  })

  // ──────────────────────────────────────────────
  // create()
  // ──────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      title: 'Problema de iluminação',
      description: 'Sem luz há 3 dias na rua.',
      category: 'INFRASTRUCTURE',
      anonymous: false,
      media: [],
    } as any

    it('throws BadRequestException when email is not verified', async () => {
      await expect(
        service.create(dto, { id: 'u1', type: 'CITIZEN', emailVerified: false }),
      ).rejects.toThrow(BadRequestException)
    })

    it('creates report and records CREATED timeline event', async () => {
      const created = makeReport({ id: 'r1' })
      mockRepo.create.mockResolvedValue(created)

      const result = await service.create(dto, { id: 'u1', type: 'CITIZEN', emailVerified: true })

      expect(result).toEqual(created)
      expect(mockRepo.create).toHaveBeenCalledTimes(1)
      expect(mockTimeline.record).toHaveBeenCalledWith(
        expect.objectContaining({ reportId: 'r1', type: EventType.CREATED }),
      )
    })

    it('passes null authorId for anonymous reports', async () => {
      const created = makeReport({ id: 'r1', anonymous: true, author: null })
      mockRepo.create.mockResolvedValue(created)

      await service.create({ ...dto, anonymous: true }, { id: 'u1', type: 'CITIZEN', emailVerified: true })

      expect(mockTimeline.record).toHaveBeenCalledWith(
        expect.objectContaining({ authorId: null }),
      )
    })
  })

  // ──────────────────────────────────────────────
  // findById()
  // ──────────────────────────────────────────────

  describe('findById', () => {
    it('throws NotFoundException when report does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException)
    })

    it('returns the report when found', async () => {
      const report = makeReport()
      mockRepo.findById.mockResolvedValue(report)
      await expect(service.findById('report-1')).resolves.toEqual(report)
    })
  })

  // ──────────────────────────────────────────────
  // updateStatus()
  // ──────────────────────────────────────────────

  describe('updateStatus', () => {
    const dto = { status: UpdatableStatus.IN_PROGRESS, content: 'Equipe a caminho.' }

    it('throws NotFoundException when report does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(
        service.updateStatus('r1', dto, { id: 'u1', type: 'ADMIN' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws ForbiddenException for CITIZEN', async () => {
      mockRepo.findById.mockResolvedValue(makeReport())
      await expect(
        service.updateStatus('r1', dto, { id: 'u1', type: 'CITIZEN' }),
      ).rejects.toThrow(ForbiddenException)
    })

    it.each(['ENTITY', 'MODERATOR', 'ADMIN'])(
      'allows %s to update status',
      async (type) => {
        mockRepo.findById.mockResolvedValue(makeReport())
        mockRepo.updateStatus.mockResolvedValue({ id: 'r1', status: ReportStatus.IN_PROGRESS })

        const result = await service.updateStatus('r1', dto, { id: 'u1', type })

        expect(result.status).toBe(ReportStatus.IN_PROGRESS)
        expect(mockTimeline.record).toHaveBeenCalledWith(
          expect.objectContaining({ type: EventType.STATUS_CHANGED }),
        )
      },
    )

    it('notifies author when updater is different from author', async () => {
      mockRepo.findById.mockResolvedValue(makeReport())
      mockRepo.updateStatus.mockResolvedValue({ id: 'r1', status: ReportStatus.IN_PROGRESS })

      await service.updateStatus('r1', dto, { id: 'another-user', type: 'ADMIN' })

      expect(mockNotifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'author-1', type: 'STATUS_CHANGED' }),
      )
    })

    it('does not notify when author updates their own report', async () => {
      mockRepo.findById.mockResolvedValue(makeReport())
      mockRepo.updateStatus.mockResolvedValue({ id: 'r1', status: ReportStatus.IN_PROGRESS })

      await service.updateStatus('r1', dto, { id: 'author-1', type: 'ENTITY' })

      expect(mockNotifications.notify).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────
  // dispute()
  // ──────────────────────────────────────────────

  describe('dispute', () => {
    const dto = { reason: 'O problema continua exatamente igual ao antes do suposto reparo.' }

    it('throws NotFoundException when report does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.dispute('r1', dto, 'u1')).rejects.toThrow(NotFoundException)
    })

    it('throws BadRequestException when report is not RESOLVED', async () => {
      mockRepo.findById.mockResolvedValue(makeReport({ status: ReportStatus.OPEN }))
      await expect(service.dispute('r1', dto, 'u1')).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException for anonymous reports', async () => {
      mockRepo.findById.mockResolvedValue(makeReport({ status: ReportStatus.RESOLVED, anonymous: true }))
      await expect(service.dispute('r1', dto, 'u1')).rejects.toThrow(BadRequestException)
    })

    it('throws ForbiddenException when user is not the report author', async () => {
      mockRepo.findById.mockResolvedValue(makeReport({ status: ReportStatus.RESOLVED }))
      mockRepo.findAuthorId.mockResolvedValue('another-author')
      await expect(service.dispute('r1', dto, 'u1')).rejects.toThrow(ForbiddenException)
    })

    it('throws BadRequestException when report was already disputed', async () => {
      const report = makeReport({
        status: ReportStatus.RESOLVED,
        timeline: [{ id: 't1', type: EventType.DISPUTED, content: 'já contestado', createdAt: new Date() }],
      })
      mockRepo.findById.mockResolvedValue(report)
      mockRepo.findAuthorId.mockResolvedValue('u1')
      await expect(service.dispute('r1', dto, 'u1')).rejects.toThrow(BadRequestException)
    })

    it('sets status to DISPUTED and records DISPUTED timeline event', async () => {
      mockRepo.findById.mockResolvedValue(makeReport({ status: ReportStatus.RESOLVED }))
      mockRepo.findAuthorId.mockResolvedValue('u1')
      mockRepo.setDisputed.mockResolvedValue({ id: 'r1', status: ReportStatus.DISPUTED })

      const result = await service.dispute('r1', dto, 'u1')

      expect(mockRepo.setDisputed).toHaveBeenCalledWith('r1')
      expect(mockTimeline.record).toHaveBeenCalledWith(
        expect.objectContaining({ type: EventType.DISPUTED, authorId: 'u1' }),
      )
      expect(result).toEqual({ id: 'r1', status: ReportStatus.DISPUTED })
    })
  })

  // ──────────────────────────────────────────────
  // resolveDispute()
  // ──────────────────────────────────────────────

  describe('resolveDispute', () => {
    const justification = 'Evidências comprovam que o problema foi de fato resolvido.'
    const moderator = { id: 'mod-1', type: 'MODERATOR' }

    it('throws ForbiddenException for CITIZEN', async () => {
      await expect(
        service.resolveDispute('r1', { decision: DisputeResolution.UPHOLD, justification }, { id: 'u1', type: 'CITIZEN' }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws ForbiddenException for ENTITY', async () => {
      await expect(
        service.resolveDispute('r1', { decision: DisputeResolution.UPHOLD, justification }, { id: 'u1', type: 'ENTITY' }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws NotFoundException when report does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(
        service.resolveDispute('r1', { decision: DisputeResolution.UPHOLD, justification }, moderator),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws BadRequestException when report is not DISPUTED', async () => {
      mockRepo.findById.mockResolvedValue(makeReport({ status: ReportStatus.RESOLVED }))
      await expect(
        service.resolveDispute('r1', { decision: DisputeResolution.UPHOLD, justification }, moderator),
      ).rejects.toThrow(BadRequestException)
    })

    it('UPHOLD → resolves back to RESOLVED', async () => {
      mockRepo.findById.mockResolvedValue(makeReport({ status: ReportStatus.DISPUTED }))
      mockRepo.resolveDispute.mockResolvedValue({ id: 'r1', status: ReportStatus.RESOLVED })
      mockRepo.findAuthorId.mockResolvedValue('author-1')

      await service.resolveDispute(
        'r1',
        { decision: DisputeResolution.UPHOLD, justification },
        moderator,
      )

      expect(mockRepo.resolveDispute).toHaveBeenCalledWith('r1', ReportStatus.RESOLVED)
    })

    it('REOPEN → reopens to OPEN', async () => {
      mockRepo.findById.mockResolvedValue(makeReport({ status: ReportStatus.DISPUTED }))
      mockRepo.resolveDispute.mockResolvedValue({ id: 'r1', status: ReportStatus.OPEN })
      mockRepo.findAuthorId.mockResolvedValue('author-1')

      await service.resolveDispute(
        'r1',
        { decision: DisputeResolution.REOPEN, justification },
        moderator,
      )

      expect(mockRepo.resolveDispute).toHaveBeenCalledWith('r1', ReportStatus.OPEN)
    })

    it('notifies the report author after resolution', async () => {
      mockRepo.findById.mockResolvedValue(makeReport({ status: ReportStatus.DISPUTED }))
      mockRepo.resolveDispute.mockResolvedValue({ id: 'r1', status: ReportStatus.RESOLVED })
      mockRepo.findAuthorId.mockResolvedValue('author-1')

      await service.resolveDispute(
        'r1',
        { decision: DisputeResolution.UPHOLD, justification },
        moderator,
      )

      expect(mockNotifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'author-1', type: 'STATUS_CHANGED' }),
      )
    })
  })
})
