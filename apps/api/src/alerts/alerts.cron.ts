import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { AlertRulesService } from './alert-rules.service'
import { AlertsService } from './alerts.service'

@Injectable()
export class AlertsCron {
  private readonly logger = new Logger(AlertsCron.name)

  constructor(
    private readonly alertsService: AlertsService,
    private readonly alertRules: AlertRulesService,
  ) {}

  // A cada 6 horas: reavalia todos os surtos ativos e detecta novos
  @Cron(CronExpression.EVERY_6_HOURS)
  async sweep(): Promise<void> {
    this.logger.log('Enqueuing batch surto reassessment')
    await this.alertsService.enqueueBatchCheck()
  }

  // A cada 15 minutos: avalia regras de alerta configuráveis e resumo diário
  @Cron('*/15 * * * *')
  async sweepRules(): Promise<void> {
    this.logger.log('Enqueuing 15-min configurable alert rules sweep')
    await this.alertRules.enqueuePeriodicSweep()
  }
}
