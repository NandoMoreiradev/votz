import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { MandateExpiryService } from './mandate-expiry.service'

@Injectable()
export class MandateExpiryCron {
  private readonly logger = new Logger(MandateExpiryCron.name)

  constructor(private readonly service: MandateExpiryService) {}

  @Cron('0 2 * * *')
  async daily(): Promise<void> {
    this.logger.log('Enqueuing daily mandate expiry check')
    await this.service.enqueue()
  }
}
