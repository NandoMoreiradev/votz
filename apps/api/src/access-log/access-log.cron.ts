import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { AccessLogService } from './access-log.service'

@Injectable()
export class AccessLogCron {
  private readonly logger = new Logger(AccessLogCron.name)

  constructor(private readonly service: AccessLogService) {}

  @Cron('30 3 * * *')
  async daily(): Promise<void> {
    this.logger.log('Enqueuing daily access log retention purge')
    await this.service.enqueuePurge()
  }
}
