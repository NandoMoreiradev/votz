import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { UserType } from '@prisma/client'
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
    }
    prisma = {
      orgMembership: { findFirst: jest.fn() },
      registrationRequest: { findMany: jest.fn() },
      $transaction: jest.fn(),
    }
    storage = {
      delete: jest.fn().mockResolvedValue(undefined),
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
    it('rejects empty password or admin/org-linked/OAuth accounts', async () => {
      await expect(service.deleteAccount('u1', '  ')).rejects.toThrow(BadRequestException)

      repo.findWithPassword.mockResolvedValueOnce({ id: 'u1', type: UserType.ADMIN, password: 'hash' })
      await expect(service.deleteAccount('u1', 'secret')).rejects.toThrow(BadRequestException)

      repo.findWithPassword.mockResolvedValueOnce({ id: 'u1', type: UserType.CITIZEN, password: 'hash' })
      prisma.orgMembership.findFirst.mockResolvedValueOnce({ id: 'm1' })
      await expect(service.deleteAccount('u1', 'secret')).rejects.toThrow(BadRequestException)

      repo.findWithPassword.mockResolvedValueOnce({ id: 'u1', type: UserType.CITIZEN, password: null })
      prisma.orgMembership.findFirst.mockResolvedValueOnce(null)
      await expect(service.deleteAccount('u1', 'secret')).rejects.toThrow(BadRequestException)
    })

    it('throws ForbiddenException when password is incorrect', async () => {
      repo.findWithPassword.mockResolvedValue({ id: 'u1', type: UserType.CITIZEN, password: 'hash' })
      prisma.orgMembership.findFirst.mockResolvedValue(null)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

      await expect(service.deleteAccount('u1', 'wrong')).rejects.toThrow(ForbiddenException)
    })

    it('anonymizes civic records, deletes user data in transaction, and deletes R2 verification docs', async () => {
      repo.findWithPassword.mockResolvedValue({ id: 'u1', type: UserType.CITIZEN, password: 'hash' })
      prisma.orgMembership.findFirst.mockResolvedValue(null)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      prisma.registrationRequest.findMany.mockResolvedValue([
        { payload: { documents: { doc1: 'verification/a.pdf', ignored: 'avatars/b.png' } } },
      ])

      const tx = {
        comment: {
          findMany: jest.fn().mockResolvedValue([{ id: 'c1' }]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        report: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        timelineEvent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        vote: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        notification: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        orgMembership: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        registrationRequest: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        user: { delete: jest.fn().mockResolvedValue({ id: 'u1' }) },
      }
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))

      const res = await service.deleteAccount('u1', 'correct-password')

      expect(tx.comment.updateMany).toHaveBeenCalledWith({
        where: { parentId: { in: ['c1'] } },
        data: { parentId: null },
      })
      expect(tx.report.updateMany).toHaveBeenCalledWith({
        where: { authorId: 'u1' },
        data: { authorId: null, anonymous: true },
      })
      expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } })
      expect(storage.delete).toHaveBeenCalledWith('verification/a.pdf')
      expect(storage.delete).toHaveBeenCalledTimes(1)
      expect(res.message).toContain('sucesso')
    })
  })
})
