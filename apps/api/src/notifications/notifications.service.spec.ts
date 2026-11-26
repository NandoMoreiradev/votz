import { NotificationType, RecipientType } from '@prisma/client'
import { NotificationsService } from './notifications.service'
import { isWithinQuietHours } from './notification-preferences.helper'

describe('NotificationsService', () => {
  let service: NotificationsService
  let repo: any
  let gateway: any
  let pushQueue: any

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      createMany: jest.fn(),
      findPreferencesForUsers: jest.fn().mockResolvedValue(new Map()),
      hasRecentDuplicate: jest.fn().mockResolvedValue(false),
      resolveRecipientUserIds: jest.fn().mockResolvedValue([]),
      findByUser: jest.fn(),
      countUnread: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    }
    gateway = {
      emitToUser: jest.fn(),
    }
    pushQueue = {
      add: jest.fn().mockResolvedValue({}),
    }
    service = new NotificationsService(repo, gateway, pushQueue)
  })

  it('creates notification in repo, emits via gateway, and enqueues push', async () => {
    const created = {
      id: 'n1',
      userId: 'u1',
      type: NotificationType.NEW_COMMENT,
      reportId: 'r1',
      metadata: { commentId: 'c1' },
      createdAt: new Date(),
    }
    repo.create.mockResolvedValue(created)

    const res = await service.notify({
      userId: 'u1',
      type: NotificationType.NEW_COMMENT,
      reportId: 'r1',
      metadata: { commentId: 'c1' },
    })

    expect(repo.create).toHaveBeenCalled()
    expect(gateway.emitToUser).toHaveBeenCalledWith('u1', 'notification', {
      id: created.id,
      type: created.type,
      reportId: created.reportId,
      metadata: created.metadata,
      createdAt: created.createdAt,
    })
    expect(pushQueue.add).toHaveBeenCalledWith(
      'send-push',
      expect.objectContaining({ userIds: ['u1'] }),
      expect.any(Object),
    )
    expect(res).toEqual(created)
  })

  it('respects UserNotificationPreference (inAppEnabled=false and event toggles)', async () => {
    repo.findPreferencesForUsers.mockResolvedValue(
      new Map([
        [
          'u1',
          {
            inAppEnabled: false,
            emailEnabled: true,
            pushEnabled: false,
            reportUpdates: true,
            reportComments: true,
            officialResponses: true,
            localSurges: true,
            officialSurveys: true,
            mentions: true,
            weeklyDigest: false,
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ],
      ]),
    )

    const res = await service.notify({
      userId: 'u1',
      type: NotificationType.NEW_COMMENT,
      reportId: 'r1',
    })

    expect(res).toBeNull()
    expect(repo.create).not.toHaveBeenCalled()
    expect(gateway.emitToUser).not.toHaveBeenCalled()
    expect(pushQueue.add).not.toHaveBeenCalled()
  })

  it('suppresses duplicate notifications within dedupWindowMs (e.g., like toggle spam)', async () => {
    repo.hasRecentDuplicate.mockResolvedValue(true)

    const res = await service.notify({
      userId: 'u1',
      type: NotificationType.POST_LIKE,
      metadata: { postId: 'p1', actorId: 'u2' },
      dedupWindowMs: 86_400_000,
      dedupMeta: { postId: 'p1', actorId: 'u2' },
    })

    expect(res).toBeNull()
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('batches notifyMany in a single createMany call and respects per-user preferences', async () => {
    repo.findPreferencesForUsers.mockResolvedValue(
      new Map([
        [
          'u2',
          {
            inAppEnabled: true,
            emailEnabled: true,
            pushEnabled: true,
            reportUpdates: true,
            reportComments: true,
            officialResponses: true,
            localSurges: false,
            officialSurveys: true,
            mentions: true,
            weeklyDigest: false,
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ],
      ]),
    )
    repo.createMany.mockResolvedValue([
      {
        id: 'n1',
        userId: 'u1',
        type: NotificationType.SURTO_DETECTED,
        reportId: null,
        metadata: { surtoId: 's1' },
        createdAt: new Date(),
      },
    ])

    const count = await service.notifyMany({
      userIds: ['u1', 'u2', 'u3', 'u1'],
      excludeUserIds: ['u3'],
      type: NotificationType.SURTO_DETECTED,
      metadata: { surtoId: 's1' },
    })

    expect(count).toBe(1)
    expect(repo.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'u1', type: NotificationType.SURTO_DETECTED }),
    ])
    expect(gateway.emitToUser).toHaveBeenCalledTimes(1)
    expect(pushQueue.add).toHaveBeenCalledTimes(1)
  })

  it('notifies resolved recipient members via notifyRecipient (including COMPANY/BRANCH)', async () => {
    repo.resolveRecipientUserIds.mockResolvedValue(['emp-1', 'emp-2'])
    repo.createMany.mockResolvedValue([
      {
        id: 'n1',
        userId: 'emp-1',
        type: NotificationType.NEW_REPORT_RECEIVED,
        reportId: 'r1',
        metadata: {},
        createdAt: new Date(),
      },
      {
        id: 'n2',
        userId: 'emp-2',
        type: NotificationType.NEW_REPORT_RECEIVED,
        reportId: 'r1',
        metadata: {},
        createdAt: new Date(),
      },
    ])

    const count = await service.notifyRecipient(RecipientType.BRANCH, 'branch-1', {
      type: NotificationType.NEW_REPORT_RECEIVED,
      reportId: 'r1',
    })

    expect(repo.resolveRecipientUserIds).toHaveBeenCalledWith(RecipientType.BRANCH, 'branch-1')
    expect(count).toBe(2)
  })

  it('works cleanly even when optional gateway and pushQueue are undefined', async () => {
    const noGwService = new NotificationsService(repo, undefined as any)
    repo.create.mockResolvedValue({ id: 'n2', type: NotificationType.STATUS_CHANGED, reportId: 'r1' })

    await expect(
      noGwService.notify({ userId: 'u1', type: NotificationType.STATUS_CHANGED, reportId: 'r1' }),
    ).resolves.toMatchObject({ id: 'n2' })
  })

  it('delegates list, unreadCount, markRead, and markAllRead', async () => {
    repo.findByUser.mockResolvedValue([{ id: 'n1' }])
    repo.countUnread.mockResolvedValue(3)

    await expect(service.list('u1', 1, 20, true)).resolves.toEqual([{ id: 'n1' }])
    expect(repo.findByUser).toHaveBeenCalledWith('u1', 1, 20, true)
    await expect(service.unreadCount('u1')).resolves.toBe(3)
    await service.markRead('n1', 'u1')
    expect(repo.markRead).toHaveBeenCalledWith('n1', 'u1')
    await service.markAllRead('u1')
    expect(repo.markAllRead).toHaveBeenCalledWith('u1')
  })

  it('evaluates quiet hours correctly across midnight wrap-around (America/Sao_Paulo)', () => {
    // 02:00 UTC = 23:00 BRT (inside 22..7)
    expect(isWithinQuietHours(22, 7, new Date('2026-11-26T02:00:00Z'))).toBe(true)
    // 15:00 UTC = 12:00 BRT (outside 22..7)
    expect(isWithinQuietHours(22, 7, new Date('2026-11-26T15:00:00Z'))).toBe(false)
    expect(isWithinQuietHours(null, null, new Date('2026-11-26T02:00:00Z'))).toBe(false)
  })
})
