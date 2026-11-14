import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { FlagReason, FlagStatus, FlagTargetType, UserType } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

jest.mock('isomorphic-dompurify', () => ({
  sanitize: (s: string) => s.replace(/<[^>]*>/g, ''),
}))

import { ModerationService } from './moderation.service'
import { CreateFlagDto } from './dto/create-flag.dto'
import { ResolveFlagDto } from './dto/resolve-flag.dto'

describe('ModerationService', () => {
  let service: ModerationService
  let repo: any
  let adminService: any
  let commentsService: any

  const verifiedUser = { id: 'user-1', emailVerified: true }
  const unverifiedUser = { id: 'user-2', emailVerified: false }

  beforeEach(() => {
    repo = {
      findReportTarget: jest.fn(),
      findCommentTarget: jest.fn(),
      findDuplicate: jest.fn().mockResolvedValue(null),
      createFlag: jest.fn().mockResolvedValue({
        id: 'flag-1',
        targetType: FlagTargetType.REPORT,
        targetId: '11111111-1111-4111-8111-111111111111',
        reason: FlagReason.OFFENSIVE,
        status: FlagStatus.OPEN,
        createdAt: new Date(),
      }),
      listFlags: jest.fn(),
      findFlagById: jest.fn(),
      resolveDismiss: jest.fn(),
      markTargetFlagsActioned: jest.fn(),
    }
    adminService = {
      deleteReport: jest.fn().mockResolvedValue({ deleted: true }),
    }
    commentsService = {
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    }

    service = new ModerationService(repo, adminService, commentsService)
  })

  describe('createFlag', () => {
    const reportUuid = '11111111-1111-4111-8111-111111111111'
    const commentUuid = '22222222-2222-4222-8222-222222222222'

    it('rejects unverified email accounts with ForbiddenException', async () => {
      await expect(
        service.createFlag(unverifiedUser, {
          targetType: FlagTargetType.REPORT,
          targetId: reportUuid,
          reason: FlagReason.SPAM_OR_ADS,
        }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('creates flag for another user report and sanitizes details', async () => {
      repo.findReportTarget.mockResolvedValue({ id: reportUuid, authorId: 'other-user', anonymous: false })

      const result = await service.createFlag(verifiedUser, {
        targetType: FlagTargetType.REPORT,
        targetId: reportUuid,
        reason: FlagReason.OFFENSIVE,
        details: '<b>Texto</b> com xingamentos.',
      })

      expect(result.id).toBe('flag-1')
      expect(repo.createFlag).toHaveBeenCalledWith({
        reporterId: 'user-1',
        targetType: FlagTargetType.REPORT,
        targetId: reportUuid,
        reason: FlagReason.OFFENSIVE,
        details: 'Texto com xingamentos.',
      })
    })

    it('accepts flagging an anonymous report without checking or leaking author', async () => {
      repo.findReportTarget.mockResolvedValue({ id: reportUuid, authorId: null, anonymous: true })

      await expect(
        service.createFlag(verifiedUser, {
          targetType: FlagTargetType.REPORT,
          targetId: reportUuid,
          reason: FlagReason.FALSE_INFO,
        }),
      ).resolves.toMatchObject({ id: 'flag-1' })
    })

    it('throws NotFoundException when report or comment does not exist', async () => {
      repo.findReportTarget.mockResolvedValue(null)
      await expect(
        service.createFlag(verifiedUser, {
          targetType: FlagTargetType.REPORT,
          targetId: reportUuid,
          reason: FlagReason.OTHER,
        }),
      ).rejects.toThrow(NotFoundException)

      repo.findCommentTarget.mockResolvedValue(null)
      await expect(
        service.createFlag(verifiedUser, {
          targetType: FlagTargetType.COMMENT,
          targetId: commentUuid,
          reason: FlagReason.OTHER,
        }),
      ).rejects.toThrow(NotFoundException)
    })

    it('blocks flagging own identified report or own comment', async () => {
      repo.findReportTarget.mockResolvedValue({ id: reportUuid, authorId: 'user-1', anonymous: false })
      await expect(
        service.createFlag(verifiedUser, {
          targetType: FlagTargetType.REPORT,
          targetId: reportUuid,
          reason: FlagReason.OTHER,
        }),
      ).rejects.toThrow(ForbiddenException)

      repo.findCommentTarget.mockResolvedValue({ id: commentUuid, authorId: 'user-1' })
      await expect(
        service.createFlag(verifiedUser, {
          targetType: FlagTargetType.COMMENT,
          targetId: commentUuid,
          reason: FlagReason.OFFENSIVE,
        }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('returns ConflictException (409) when user flags same target twice or hits P2002', async () => {
      repo.findCommentTarget.mockResolvedValue({ id: commentUuid, authorId: 'other-user' })
      repo.findDuplicate.mockResolvedValueOnce({ id: 'existing-flag' })

      await expect(
        service.createFlag(verifiedUser, {
          targetType: FlagTargetType.COMMENT,
          targetId: commentUuid,
          reason: FlagReason.PERSONAL_DATA,
        }),
      ).rejects.toThrow(ConflictException)

      repo.findDuplicate.mockResolvedValueOnce(null)
      repo.createFlag.mockRejectedValueOnce({ code: 'P2002' })

      await expect(
        service.createFlag(verifiedUser, {
          targetType: FlagTargetType.COMMENT,
          targetId: commentUuid,
          reason: FlagReason.PERSONAL_DATA,
        }),
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('listFlags', () => {
    it('passes status, page and clamps limit to 50', async () => {
      repo.listFlags.mockResolvedValue({ data: [], meta: { total: 0, openCount: 0 } })
      await service.listFlags(FlagStatus.OPEN, 2, 100)
      expect(repo.listFlags).toHaveBeenCalledWith({ status: FlagStatus.OPEN, page: 2, limit: 50 })
    })
  })

  describe('resolveFlag', () => {
    const actor = { id: 'mod-1', type: UserType.MODERATOR }

    it('throws NotFoundException or BadRequestException when flag is missing or already resolved', async () => {
      repo.findFlagById.mockResolvedValueOnce(null)
      await expect(
        service.resolveFlag('missing', actor, { action: 'DISMISS', note: 'Sem violação encontrada.' }),
      ).rejects.toThrow(NotFoundException)

      repo.findFlagById.mockResolvedValueOnce({
        id: 'flag-1',
        targetType: FlagTargetType.REPORT,
        targetId: 'rep-1',
        status: FlagStatus.ACTIONED,
      })
      await expect(
        service.resolveFlag('flag-1', actor, { action: 'DISMISS', note: 'Já resolvido antes.' }),
      ).rejects.toThrow(BadRequestException)
    })

    it('dismisses flag without removing content', async () => {
      repo.findFlagById.mockResolvedValue({
        id: 'flag-1',
        targetType: FlagTargetType.REPORT,
        targetId: 'rep-1',
        status: FlagStatus.OPEN,
      })
      repo.resolveDismiss.mockResolvedValue({ id: 'flag-1', status: FlagStatus.DISMISSED })

      const res = await service.resolveFlag('flag-1', actor, {
        action: 'DISMISS',
        note: 'Relato dentro das diretrizes da plataforma.',
      })

      expect(res).toEqual({ id: 'flag-1', status: FlagStatus.DISMISSED })
      expect(repo.resolveDismiss).toHaveBeenCalledWith(
        'flag-1',
        'mod-1',
        'Relato dentro das diretrizes da plataforma.',
      )
      expect(adminService.deleteReport).not.toHaveBeenCalled()
      expect(commentsService.delete).not.toHaveBeenCalled()
    })

    it('removes REPORT via AdminService (audit + mail notice flow) and marks open flags as ACTIONED', async () => {
      repo.findFlagById.mockResolvedValue({
        id: 'flag-1',
        targetType: FlagTargetType.REPORT,
        targetId: 'rep-1',
        status: FlagStatus.OPEN,
      })
      repo.markTargetFlagsActioned.mockResolvedValue({ status: FlagStatus.ACTIONED, updatedCount: 3 })

      const res = await service.resolveFlag('flag-1', actor, {
        action: 'REMOVE_CONTENT',
        note: 'Relato com exposição indevida de CPF.',
      })

      expect(adminService.deleteReport).toHaveBeenCalledWith(
        'rep-1',
        'mod-1',
        'Relato com exposição indevida de CPF.',
      )
      expect(repo.markTargetFlagsActioned).toHaveBeenCalledWith(
        FlagTargetType.REPORT,
        'rep-1',
        'mod-1',
        'Relato com exposição indevida de CPF.',
      )
      expect(res).toEqual({ status: FlagStatus.ACTIONED, updatedCount: 3 })
    })

    it('removes COMMENT via CommentsService (audit + mail notice flow) and marks open flags as ACTIONED', async () => {
      repo.findFlagById.mockResolvedValue({
        id: 'flag-2',
        targetType: FlagTargetType.COMMENT,
        targetId: 'com-1',
        status: FlagStatus.OPEN,
      })
      repo.markTargetFlagsActioned.mockResolvedValue({ status: FlagStatus.ACTIONED, updatedCount: 1 })

      const res = await service.resolveFlag('flag-2', actor, {
        action: 'REMOVE_CONTENT',
        note: 'Comentário com ameaça e xingamentos.',
      })

      expect(commentsService.delete).toHaveBeenCalledWith(
        'com-1',
        'mod-1',
        UserType.MODERATOR,
        'Comentário com ameaça e xingamentos.',
      )
      expect(repo.markTargetFlagsActioned).toHaveBeenCalledWith(
        FlagTargetType.COMMENT,
        'com-1',
        'mod-1',
        'Comentário com ameaça e xingamentos.',
      )
      expect(res).toEqual({ status: FlagStatus.ACTIONED, updatedCount: 1 })
    })
  })

  describe('DTO validation (T3)', () => {
    it('rejects invalid CreateFlagDto values (400)', async () => {
      const badTarget = plainToInstance(CreateFlagDto, {
        targetType: 'INVALID',
        targetId: 'not-a-uuid',
        reason: 'NOPE',
      })
      const errors = await validate(badTarget)
      expect(errors.length).toBeGreaterThanOrEqual(3)

      const valid = plainToInstance(CreateFlagDto, {
        targetType: FlagTargetType.COMMENT,
        targetId: '11111111-1111-4111-8111-111111111111',
        reason: FlagReason.SPAM_OR_ADS,
      })
      expect(await validate(valid)).toHaveLength(0)
    })

    it('rejects ResolveFlagDto with invalid action or short note', async () => {
      const invalid = plainToInstance(ResolveFlagDto, { action: 'IGNORE', note: 'curta' })
      expect((await validate(invalid)).length).toBeGreaterThanOrEqual(2)

      const valid = plainToInstance(ResolveFlagDto, {
        action: 'REMOVE_CONTENT',
        note: 'Conteúdo viola as diretrizes.',
      })
      expect(await validate(valid)).toHaveLength(0)
    })
  })
})
