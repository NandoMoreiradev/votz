import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { AlertsService } from './alerts.service'

@Injectable()
export class AlertsCron {
  private readonly logger = new Logger(AlertsCron.name)

  constructor(private readonly alertsService: AlertsService) {}

  // A cada 6 horas: reavalia todos os surtos ativos e detecta novos
  @Cron(CronExpression.EVERY_6_HOURS)
  async sweep(): Promise<void> {
    this.logger.log('Enqueuing batch surto reassessment')
    await this.alertsService.enqueueBatchCheck()
  }
}
