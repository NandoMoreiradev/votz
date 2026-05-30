import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { IbgeSyncService } from './ibge-sync.service'

@Injectable()
export class IbgeSyncCron {
  private readonly logger = new Logger(IbgeSyncCron.name)

  constructor(private readonly service: IbgeSyncService) {}

  // Primeiro dia de cada mês às 02:00 — municípios mudam raramente
  @Cron('0 2 1 * *')
  async monthlySync(): Promise<void> {
    this.logger.log('Disparando sync mensal de municípios do IBGE')
    await this.service.triggerSync()
  }
}
