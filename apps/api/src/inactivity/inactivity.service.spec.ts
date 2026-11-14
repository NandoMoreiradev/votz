import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { MembershipStatus, UserType } from '@prisma/client'
import { InactivityService, INACTIVITY_QUEUE } from './inactivity.service'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { UsersService } from '../users/users.service'

const mockQueue = { add: jest.fn() }
const mockMail = { sendInactivityNotice: jest.fn() }
const mockUsersService = { eraseUserData: jest.fn() }
const mockPrisma = {
  user: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
}

describe('InactivityService', () => {
  let service: InactivityService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InactivityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        { provide: UsersService, useValue: mockUsersService },
        { provide: getQueueToken(INACTIVITY_QUEUE), useValue: mockQueue },
      ],
    }).compile()

    service = module.get(InactivityService)
    jest.clearAllMocks()
    mockMail.sendInactivityNotice.mockResolvedValue(undefined)
    mockUsersService.eraseUserData.mockResolvedValue(undefined)
    mockPrisma.user.update.mockResolvedValue({})
  })

  describe('sendInactivityNotices', () => {
    it('filters only CITIZEN, non-banned, no active OrgMembership, without prior notice, inactive > 24 months', async () => {
      const now = new Date('2026-11-14T05:00:00.000Z')
      mockPrisma.user.findMany.mockResolvedValue([])

      await service.sendInactivityNotices(now)

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: UserType.CITIZEN,
            banned: false,
            inactivityNoticeSentAt: null,
            memberships: { none: { status: MembershipStatus.ACTIVE } },
            OR: [
              { lastLoginAt: { lt: new Date('2024-11-14T05:00:00.000Z') } },
              { lastLoginAt: null, createdAt: { lt: new Date('2024-11-14T05:00:00.000Z') } },
            ],
          },
          take: 100,
        }),
      )
    })

    it('sends notice once, sets inactivityNoticeSentAt, and ignores ADMIN/MODERATOR/banned/already-notified', async () => {
      const now = new Date('2026-11-14T05:00:00.000Z')
      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: 'u-eligible',
          email: 'old@votz.app',
          name: 'Maria',
          type: UserType.CITIZEN,
          banned: false,
          lastLoginAt: new Date('2024-10-01T00:00:00.000Z'),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          inactivityNoticeSentAt: null,
        },
        {
          id: 'u-admin',
          email: 'admin@votz.app',
          name: 'Admin',
          type: UserType.ADMIN,
          banned: false,
          lastLoginAt: new Date('2023-01-01T00:00:00.000Z'),
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          inactivityNoticeSentAt: null,
        },
        {
          id: 'u-mod',
          email: 'mod@votz.app',
          name: 'Mod',
          type: UserType.MODERATOR,
          banned: false,
          lastLoginAt: new Date('2023-01-01T00:00:00.000Z'),
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          inactivityNoticeSentAt: null,
        },
        {
          id: 'u-banned',
          email: 'banned@votz.app',
          name: 'Banned',
          type: UserType.CITIZEN,
          banned: true,
          lastLoginAt: new Date('2023-01-01T00:00:00.000Z'),
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          inactivityNoticeSentAt: null,
        },
        {
          id: 'u-already-notified',
          email: 'notified@votz.app',
          name: 'Notified',
          type: UserType.CITIZEN,
          banned: false,
          lastLoginAt: new Date('2023-01-01T00:00:00.000Z'),
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          inactivityNoticeSentAt: new Date('2026-11-01T00:00:00.000Z'),
        },
      ])

      const notified = await service.sendInactivityNotices(now)

      expect(notified).toBe(1)
      expect(mockMail.sendInactivityNotice).toHaveBeenCalledTimes(1)
      expect(mockMail.sendInactivityNotice).toHaveBeenCalledWith('old@votz.app', 'Maria')
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-eligible' },
        data: { inactivityNoticeSentAt: now },
      })
    })
  })

  describe('anonymizeInactiveUsers', () => {
    it('anonymizes users 30+ days after notice with no subsequent login and preserves users who logged in after notice', async () => {
      const now = new Date('2026-11-14T05:00:00.000Z')
      const noticeDate = new Date('2026-10-01T05:00:00.000Z') // > 30 days ago

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: 'u-erase-old-login',
          type: UserType.CITIZEN,
          banned: false,
          lastLoginAt: new Date('2024-09-01T00:00:00.000Z'),
          inactivityNoticeSentAt: noticeDate,
        },
        {
          id: 'u-erase-null-login',
          type: UserType.CITIZEN,
          banned: false,
          lastLoginAt: null,
          inactivityNoticeSentAt: noticeDate,
        },
        {
          id: 'u-returned',
          type: UserType.CITIZEN,
          banned: false,
          lastLoginAt: new Date('2026-10-10T00:00:00.000Z'), // logged in AFTER noticeDate
          inactivityNoticeSentAt: noticeDate,
        },
        {
          id: 'u-recent-notice',
          type: UserType.CITIZEN,
          banned: false,
          lastLoginAt: null,
          inactivityNoticeSentAt: new Date('2026-11-01T05:00:00.000Z'), // < 30 days ago
        },
        {
          id: 'u-admin',
          type: UserType.ADMIN,
          banned: false,
          lastLoginAt: null,
          inactivityNoticeSentAt: noticeDate,
        },
      ])

      const count = await service.anonymizeInactiveUsers(now)

      expect(count).toBe(2)
      expect(mockUsersService.eraseUserData).toHaveBeenCalledTimes(2)
      expect(mockUsersService.eraseUserData).toHaveBeenCalledWith('u-erase-old-login')
      expect(mockUsersService.eraseUserData).toHaveBeenCalledWith('u-erase-null-login')
      expect(mockUsersService.eraseUserData).not.toHaveBeenCalledWith('u-returned')
      expect(mockUsersService.eraseUserData).not.toHaveBeenCalledWith('u-recent-notice')
      expect(mockUsersService.eraseUserData).not.toHaveBeenCalledWith('u-admin')

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-returned' },
        data: { inactivityNoticeSentAt: null },
      })
    })
  })
})
