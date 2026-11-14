import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { VerificationRetentionService } from './verification-retention.service'

@Injectable()
export class VerificationRetentionCron {
  private readonly logger = new Logger(VerificationRetentionCron.name)

  constructor(private readonly service: VerificationRetentionService) {}

  @Cron('0 4 * * *')
  async daily(): Promise<void> {
    this.logger.log('Enqueuing daily verification documents retention check')
    await this.service.enqueue()
  }
}
