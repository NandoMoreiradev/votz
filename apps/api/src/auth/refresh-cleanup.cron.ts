import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { RefreshCleanupService } from './refresh-cleanup.service'

@Injectable()
export class RefreshCleanupCron {
  private readonly logger = new Logger(RefreshCleanupCron.name)

  constructor(private readonly service: RefreshCleanupService) {}

  @Cron('0 3 * * *')
  async daily(): Promise<void> {
    this.logger.log('Enqueuing daily refresh token cleanup')
    await this.service.enqueue()
  }
}
