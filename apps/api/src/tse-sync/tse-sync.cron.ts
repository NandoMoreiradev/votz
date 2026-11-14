import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { TseSyncService } from './tse-sync.service'

@Injectable()
export class TseSyncCron {
  private readonly logger = new Logger(TseSyncCron.name)

  constructor(private readonly service: TseSyncService) {}

  // 1º de janeiro às 04:00 — início do mandato executivo/municipal + atualização geral pós-eleição
  @Cron('0 4 1 1 *')
  async yearlyGeneral(): Promise<void> {
    this.logger.log('Disparando sync anual de eleição geral (TSE)')
    await this.service.triggerSync('geral')
  }

  // 1º de novembro às 04:00 — logo após o 2º turno em anos eleitorais
  @Cron('0 4 1 11 *')
  async postElectionNovember(): Promise<void> {
    this.logger.log('Disparando sync pós-eleição (novembro) de eleição geral e municipal (TSE)')
    await this.service.triggerSync('geral')
    await this.service.triggerSync('municipal')
  }

  // 1º de janeiro às 05:00 — mandatos municipais
  @Cron('0 5 1 1 *')
  async yearlyMunicipal(): Promise<void> {
    this.logger.log('Disparando sync anual de eleição municipal (TSE)')
    await this.service.triggerSync('municipal')
  }
}
