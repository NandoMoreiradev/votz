import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PressureService } from './pressure.service'

@Injectable()
export class PressureCron {
  private readonly logger = new Logger(PressureCron.name)

  constructor(private readonly pressureService: PressureService) {}

  // Sweep horário: recalcula todos os relatos ativos para capturar a deriva
  // de diasSemResposta (relatos sem interação ainda acumulam pressão com o tempo)
  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    this.logger.log('Enqueuing hourly pressure batch')
    await this.pressureService.enqueueBatch()
  }
}
