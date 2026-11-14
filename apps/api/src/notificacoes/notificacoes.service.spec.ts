import { NotificationType } from '@prisma/client'
import { NotificacoesService } from './notificacoes.service'

describe('NotificacoesService', () => {
  let service: NotificacoesService
  let repo: any

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findByUser: jest.fn(),
      countUnread: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    }
    service = new NotificacoesService(repo)
  })

  it('creates notification and manages read status', async () => {
    repo.create.mockResolvedValue({ id: 'notif-1' })
    repo.findByUser.mockResolvedValue([{ id: 'notif-1' }])
    repo.countUnread.mockResolvedValue(2)

    await expect(
      service.notify({
        userId: 'u1',
        type: NotificationType.NEW_COMMENT,
        reportId: 'r1',
        metadata: { actor: 'u2' },
      }),
    ).resolves.toEqual({ id: 'notif-1' })
    await expect(service.list('u1')).resolves.toEqual([{ id: 'notif-1' }])
    await expect(service.unreadCount('u1')).resolves.toBe(2)

    await service.markRead('notif-1', 'u1')
    expect(repo.markRead).toHaveBeenCalledWith('notif-1', 'u1')

    await service.markAllRead('u1')
    expect(repo.markAllRead).toHaveBeenCalledWith('u1')
  })
})
