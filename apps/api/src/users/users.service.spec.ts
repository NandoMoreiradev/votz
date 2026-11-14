import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { UserType } from '@prisma/client'
import { TERMS_VERSION, PRIVACY_VERSION } from '@votz/shared-types'
import { UsersService } from './users.service'

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}))

describe('UsersService', () => {
  let service: UsersService
  let repo: any
  let prisma: any
  let storage: any
  let lgpdQueue: any

  beforeEach(() => {
    repo = {
      findByIdWithStats: jest.fn(),
      findMe: jest.fn(),
      findById: jest.fn(),
      findUserReports: jest.fn(),
      updateProfile: jest.fn(),
      findWithPassword: jest.fn(),
      acceptConsent: jest.fn(),
    }
    prisma = {
      orgMembership: { findFirst: jest.fn() },
      registrationRequest: { findMany: jest.fn() },
      $transaction: jest.fn(),
    }
    storage = {
      delete: jest.fn().mockResolvedValue(undefined),
      extractKeyFromUrl: jest.fn().mockReturnValue(null),
    }
    lgpdQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    }

    service = new UsersService(repo, prisma, storage, lgpdQueue)
  })

  afterEach(() => jest.restoreAllMocks())

  describe('findById & findMe', () => {
    it('returns user or throws NotFoundException', async () => {
      repo.findByIdWithStats.mockResolvedValueOnce({ id: 'u1', name: 'Ana' })
      await expect(service.findById('u1')).resolves.toEqual({ id: 'u1', name: 'Ana' })

      repo.findByIdWithStats.mockResolvedValueOnce(null)
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException)

      repo.findMe.mockResolvedValueOnce(null)
      await expect(service.findMe('missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('findUserReports', () => {
    it('throws NotFoundException when user does not exist', async () => {
      repo.findById.mockResolvedValue(null)
      await expect(service.findUserReports('missing', 1, 10)).rejects.toThrow(NotFoundException)
    })

    it('delegates to repo when user exists', async () => {
      repo.findById.mockResolvedValue({ id: 'u1' })
      repo.findUserReports.mockResolvedValue({ data: [], meta: { total: 0 } })
      const res = await service.findUserReports('u1', 1, 10)
      expect(res).toEqual({ data: [], meta: { total: 0 } })
    })
  })

  describe('updateProfile', () => {
    it('throws ForbiddenException when editing another user profile', async () => {
      await expect(service.updateProfile('u1', 'u2', { name: 'Hacker' } as any)).rejects.toThrow(ForbiddenException)
    })

    it('throws NotFoundException when user does not exist', async () => {
      repo.findById.mockResolvedValue(null)
      await expect(service.updateProfile('u1', 'u1', { name: 'Ana' } as any)).rejects.toThrow(NotFoundException)
    })

    it('updates allowed profile fields', async () => {
      repo.findById.mockResolvedValue({ id: 'u1' })
      repo.updateProfile.mockResolvedValue({ id: 'u1', name: 'Ana Silva', city: 'SP' })

      const res = await service.updateProfile('u1', 'u1', { name: 'Ana Silva', city: 'SP' } as any)
      expect(repo.updateProfile).toHaveBeenCalledWith('u1', expect.objectContaining({ name: 'Ana Silva', city: 'SP' }))
      expect(res.name).toBe('Ana Silva')
    })
  })

  describe('acceptConsent', () => {
    const validDto = {
      acceptedTermsVersion: TERMS_VERSION,
      acceptedPrivacyVersion: PRIVACY_VERSION,
      confirmAge18: true,
    }

    it('throws BadRequestException when confirmAge18 is not true', async () => {
      await expect(service.acceptConsent('u1', { ...validDto, confirmAge18: false })).rejects.toThrow(BadRequestException)
      expect(repo.acceptConsent).not.toHaveBeenCalled()
    })

    it('throws ConflictException when versions do not match current constants', async () => {
      await expect(
        service.acceptConsent('u1', { ...validDto, acceptedTermsVersion: 'old-version' }),
      ).rejects.toThrow(ConflictException)
      await expect(
        service.acceptConsent('u1', { ...validDto, acceptedPrivacyVersion: 'old-version' }),
      ).rejects.toThrow(ConflictException)
      expect(repo.acceptConsent).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when user does not exist', async () => {
      repo.findById.mockResolvedValue(null)
      await expect(service.acceptConsent('missing', validDto)).rejects.toThrow(NotFoundException)
    })

    it('records consent timestamps and versions and returns updated user', async () => {
      repo.findById.mockResolvedValue({ id: 'u1' })
      const updated = {
        id: 'u1',
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        termsAcceptedAt: new Date(),
        ageConfirmedAt: new Date(),
      }
      repo.acceptConsent.mockResolvedValue(updated)

      const res = await service.acceptConsent('u1', validDto)

      expect(repo.acceptConsent).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          termsAcceptedAt: expect.any(Date),
          ageConfirmedAt: expect.any(Date),
        }),
      )
      expect(res).toEqual(updated)
    })
  })

  describe('requestDataExport', () => {
    it('enqueues LGPD export job for user', async () => {
      repo.findWithPassword.mockResolvedValue({ id: 'u1', email: 'ana@votz.app', name: 'Ana' })

      const res = await service.requestDataExport('u1')

      expect(lgpdQueue.add).toHaveBeenCalledWith(
        'export-data',
        { userId: 'u1', email: 'ana@votz.app', name: 'Ana' },
        expect.objectContaining({ attempts: 3 }),
      )
      expect(res.message).toContain('Exportação iniciada')
    })
  })

  describe('deleteAccount', () => {
    function buildTxMock(overrides: Partial<Record<string, any>> = {}) {
      return {
        comment: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'c1', mediaKey: 'comments/voice-1.webm' },
            { id: 'c2', mediaKey: null },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        report: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        timelineEvent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        propostaTimeline: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        registrationRequest: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        debatePollVote: {
          findMany: jest.fn().mockResolvedValue([
            { optionId: 'opt-1' },
            { optionId: 'opt-2' },
          ]),
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        debatePollOption: {
          update: jest.fn().mockResolvedValue({ id: 'opt-1', totalVotes: 4 }),
        },
        debateQuestion: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        debateMessage: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        propostaVoto: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        apiKey: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        userPoliticianFollower: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        vote: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        notification: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        orgMembership: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        accessLog: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          delete: jest.fn(),
        },
        user: { delete: jest.fn().mockResolvedValue({ id: 'u1' }) },
        ...overrides,
      }
    }

    it('rejects empty password, admin/moderator, and active entity/politician org-linked accounts', async () => {
      repo.findWithPassword.mockResolvedValueOnce({ id: 'u1', type: UserType.CITIZEN, password: 'hash', email: 'u@votz.app' })
      prisma.orgMembership.findFirst.mockResolvedValueOnce(null)
      await expect(service.deleteAccount('u1', { password: '  ' })).rejects.toThrow(BadRequestException)

      repo.findWithPassword.mockResolvedValueOnce({ id: 'u1', type: UserType.ADMIN, password: 'hash', email: 'u@votz.app' })
      await expect(service.deleteAccount('u1', { password: 'secret' })).rejects.toThrow(
        'fernandomoreira.dev@gmail.com',
      )

      repo.findWithPassword.mockResolvedValueOnce({ id: 'u1', type: UserType.CITIZEN, password: 'hash', email: 'u@votz.app' })
      prisma.orgMembership.findFirst.mockResolvedValueOnce({ id: 'm1' })
      await expect(service.deleteAccount('u1', { password: 'secret' })).rejects.toThrow(
        'fernandomoreira.dev@gmail.com',
      )
    })

    it('throws ForbiddenException when password is incorrect', async () => {
      repo.findWithPassword.mockResolvedValue({ id: 'u1', type: UserType.CITIZEN, password: 'hash', email: 'u@votz.app' })
      prisma.orgMembership.findFirst.mockResolvedValue(null)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

      await expect(service.deleteAccount('u1', { password: 'wrong' })).rejects.toThrow(ForbiddenException)
    })

    it('allows Google-only account deletion with matching email (case-insensitive) and rejects wrong email with 403', async () => {
      repo.findWithPassword.mockResolvedValue({
        id: 'u-google',
        type: UserType.CITIZEN,
        password: null,
        email: 'Ana@Example.com',
        avatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
      })
      prisma.orgMembership.findFirst.mockResolvedValue(null)
      await expect(service.deleteAccount('u-google', { confirmEmail: '' })).rejects.toThrow(BadRequestException)

      await expect(service.deleteAccount('u-google', { confirmEmail: 'other@example.com' })).rejects.toThrow(
        ForbiddenException,
      )

      prisma.registrationRequest.findMany.mockResolvedValue([])
      const tx = buildTxMock()
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))

      const res = await service.deleteAccount('u-google', { confirmEmail: 'ana@example.com' })
      expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'u-google' } })
      expect(res.message).toContain('sucesso')
    })

    it('cleans all user relations, decrements debate poll option counts, and deletes R2 verification, audio, and avatar objects', async () => {
      repo.findWithPassword.mockResolvedValue({
        id: 'u1',
        type: UserType.CITIZEN,
        password: 'hash',
        email: 'u1@votz.app',
        avatarUrl: 'https://pub-r2.dev/avatars/u1.png',
      })
      prisma.orgMembership.findFirst.mockResolvedValue(null)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      storage.extractKeyFromUrl.mockReturnValue('avatars/u1.png')
      prisma.registrationRequest.findMany.mockResolvedValue([
        { payload: { documents: { doc1: 'verification/a.pdf', ignored: 'other/b.png' } } },
      ])

      const tx = buildTxMock()
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))

      const res = await service.deleteAccount('u1', { password: 'correct-password' })

      expect(tx.comment.updateMany).toHaveBeenCalledWith({
        where: { parentId: { in: ['c1', 'c2'] } },
        data: { parentId: null },
      })
      expect(tx.report.updateMany).toHaveBeenCalledWith({
        where: { authorId: 'u1' },
        data: { authorId: null, anonymous: true },
      })
      expect(tx.timelineEvent.updateMany).toHaveBeenCalledWith({
        where: { authorId: 'u1' },
        data: { authorId: null },
      })
      expect(tx.propostaTimeline.updateMany).toHaveBeenCalledWith({
        where: { autorId: 'u1' },
        data: { autorId: null },
      })
      expect(tx.registrationRequest.updateMany).toHaveBeenCalledWith({
        where: { reviewerId: 'u1' },
        data: { reviewerId: null },
      })

      expect(tx.debatePollOption.update).toHaveBeenCalledWith({
        where: { id: 'opt-1' },
        data: { totalVotes: { decrement: 1 } },
      })
      expect(tx.debatePollOption.update).toHaveBeenCalledWith({
        where: { id: 'opt-2' },
        data: { totalVotes: { decrement: 1 } },
      })
      expect(tx.debatePollVote.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
      expect(tx.debateQuestion.deleteMany).toHaveBeenCalledWith({ where: { authorId: 'u1' } })
      expect(tx.debateMessage.deleteMany).toHaveBeenCalledWith({ where: { authorId: 'u1' } })
      expect(tx.propostaVoto.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: 'u1' } })
      expect(tx.apiKey.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
      expect(tx.userPoliticianFollower.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
      expect(tx.comment.deleteMany).toHaveBeenCalledWith({ where: { authorId: 'u1' } })
      expect(tx.vote.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
      expect(tx.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
      expect(tx.orgMembership.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
      expect(tx.registrationRequest.deleteMany).toHaveBeenCalledWith({ where: { requesterId: 'u1' } })
      expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } })

      expect(storage.delete).toHaveBeenCalledWith('verification/a.pdf')
      expect(storage.delete).toHaveBeenCalledWith('comments/voice-1.webm')
      expect(storage.delete).toHaveBeenCalledWith('avatars/u1.png')
      expect(storage.delete).toHaveBeenCalledTimes(3)
      expect(tx.accessLog.deleteMany).not.toHaveBeenCalled()
      expect(tx.accessLog.delete).not.toHaveBeenCalled()
      expect(res.message).toContain('sucesso')
    })

    it('exposes reusable eraseUserData that looks up user avatar and preserves AccessLog', async () => {
      prisma.user = { findUnique: jest.fn().mockResolvedValue({ avatarUrl: 'https://pub-r2.dev/avatars/u2.png' }) }
      prisma.registrationRequest.findMany.mockResolvedValue([])
      storage.extractKeyFromUrl.mockReturnValue('avatars/u2.png')

      const tx = buildTxMock()
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))

      await service.eraseUserData('u2')

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u2' },
        select: { avatarUrl: true },
      })
      expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'u2' } })
      expect(tx.accessLog.deleteMany).not.toHaveBeenCalled()
      expect(tx.accessLog.delete).not.toHaveBeenCalled()
      expect(storage.delete).toHaveBeenCalledWith('avatars/u2.png')
    })
  })
})
