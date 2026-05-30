import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SenadoSyncService } from './senado-sync.service'

@Injectable()
export class SenadoSyncCron {
  private readonly logger = new Logger(SenadoSyncCron.name)

  constructor(private readonly service: SenadoSyncService) {}

  // Toda terça-feira às 03:00 — um dia depois do sync da Câmara
  @Cron('0 3 * * 2')
  async weeklySync(): Promise<void> {
    this.logger.log('Disparando sync semanal do Senado Federal')
    await this.service.triggerSync()
  }
}
