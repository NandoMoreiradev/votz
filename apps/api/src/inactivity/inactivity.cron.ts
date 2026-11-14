import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InactivityService } from './inactivity.service'

@Injectable()
export class InactivityCron {
  private readonly logger = new Logger(InactivityCron.name)

  constructor(private readonly service: InactivityService) {}

  @Cron('0 5 * * *')
  async daily(): Promise<void> {
    this.logger.log('Enqueuing daily account inactivity check')
    await this.service.enqueue()
  }
}
