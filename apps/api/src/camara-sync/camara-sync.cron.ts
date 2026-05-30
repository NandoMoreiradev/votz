import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CamaraSyncService } from './camara-sync.service'

@Injectable()
export class CamaraSyncCron {
  private readonly logger = new Logger(CamaraSyncCron.name)

  constructor(private readonly service: CamaraSyncService) {}

  // Toda segunda-feira às 03:00 — fora do horário de pico
  @Cron('0 3 * * 1')
  async weeklySync(): Promise<void> {
    this.logger.log('Disparando sync semanal da Câmara dos Deputados')
    await this.service.triggerSync()
  }
}
