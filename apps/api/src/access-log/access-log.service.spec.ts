import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { AccessEvent } from '@prisma/client'
import { AccessLogService, ACCESS_LOG_RETENTION_QUEUE } from './access-log.service'
import { PrismaService } from '../prisma/prisma.service'

const mockQueue = { add: jest.fn() }
const mockPrisma = {
  accessLog: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
}

describe('AccessLogService', () => {
  let service: AccessLogService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessLogService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(ACCESS_LOG_RETENTION_QUEUE), useValue: mockQueue },
      ],
    }).compile()

    service = module.get(AccessLogService)
    jest.clearAllMocks()
  })

  describe('record', () => {
    it('creates minimal access log with userId, event and ip', async () => {
      mockPrisma.accessLog.create.mockResolvedValue({ id: 'log-1' })

      await service.record('u1', AccessEvent.LOGIN, '187.10.20.30')

      expect(mockPrisma.accessLog.create).toHaveBeenCalledWith({
        data: { userId: 'u1', event: AccessEvent.LOGIN, ip: '187.10.20.30' },
      })
    })

    it('swallows persistence errors without throwing (fire-and-forget)', async () => {
      mockPrisma.accessLog.create.mockRejectedValue(new Error('DB connection lost'))

      await expect(service.record('u1', AccessEvent.REGISTER, '127.0.0.1')).resolves.toBeUndefined()
    })
  })

  describe('enqueuePurge', () => {
    it('enqueues purge-expired job in BullMQ queue', async () => {
      await service.enqueuePurge()

      expect(mockQueue.add).toHaveBeenCalledWith(
        'purge-expired',
        {},
        expect.objectContaining({ jobId: 'access-log-daily-purge' }),
      )
    })
  })

  describe('purgeExpired', () => {
    it('deletes only logs older than 6 months and preserves recent ones via lt cutoff', async () => {
      const now = new Date('2026-11-14T03:30:00.000Z')
      mockPrisma.accessLog.deleteMany.mockResolvedValue({ count: 42 })

      const res = await service.purgeExpired(now)

      expect(res).toEqual({ deleted: 42 })
      expect(mockPrisma.accessLog.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lt: new Date('2026-05-14T03:30:00.000Z') },
        },
      })
    })
  })
})
