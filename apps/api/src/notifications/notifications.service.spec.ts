import { NotificationType } from '@prisma/client'
import { NotificationsService } from './notifications.service'

describe('NotificationsService', () => {
  let service: NotificationsService
  let repo: any
  let gateway: any

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findByUser: jest.fn(),
      countUnread: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    }
    gateway = {
      emitToUser: jest.fn(),
    }
    service = new NotificationsService(repo, gateway)
  })

  it('creates notification in repo and emits via gateway when present', async () => {
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
    expect(res).toEqual(created)
  })

  it('works cleanly even when optional gateway is undefined', async () => {
    const noGwService = new NotificationsService(repo, undefined as any)
    repo.create.mockResolvedValue({ id: 'n2', type: NotificationType.STATUS_CHANGED, reportId: 'r1' })

    await expect(
      noGwService.notify({ userId: 'u1', type: NotificationType.STATUS_CHANGED, reportId: 'r1' }),
    ).resolves.toMatchObject({ id: 'n2' })
  })

  it('delegates list, unreadCount, markRead, and markAllRead', async () => {
    repo.findByUser.mockResolvedValue([{ id: 'n1' }])
    repo.countUnread.mockResolvedValue(3)

    await expect(service.list('u1')).resolves.toEqual([{ id: 'n1' }])
    await expect(service.unreadCount('u1')).resolves.toBe(3)
    await service.markRead('n1', 'u1')
    expect(repo.markRead).toHaveBeenCalledWith('n1', 'u1')
    await service.markAllRead('u1')
    expect(repo.markAllRead).toHaveBeenCalledWith('u1')
  })
})
