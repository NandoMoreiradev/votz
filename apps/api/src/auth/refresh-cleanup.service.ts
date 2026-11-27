import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { DAY_MS, windowedJobId } from '../common/queue/job-window'
import { PrismaService } from '../prisma/prisma.service'

export const REFRESH_CLEANUP_QUEUE = 'refresh-cleanup'

const RETENTION_DAYS = 30

@Injectable()
export class RefreshCleanupService {
  private readonly logger = new Logger(RefreshCleanupService.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(REFRESH_CLEANUP_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(): Promise<void> {
    await this.queue.add(
      'purge-expired-tokens',
      {},
      { jobId: windowedJobId('refresh-cleanup', DAY_MS), removeOnComplete: 10, removeOnFail: 10 },
    )
  }

  async purgeExpiredTokens(now = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000)
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    })

    if (result.count > 0) {
      this.logger.log(`Purged ${result.count} refresh tokens expired before ${cutoff.toISOString()}`)
    }

    return { deleted: result.count }
  }
}
