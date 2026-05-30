import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { TseSyncService } from './tse-sync.service'

@Injectable()
export class TseSyncCron {
  private readonly logger = new Logger(TseSyncCron.name)

  constructor(private readonly service: TseSyncService) {}

  // Eleições federais/estaduais: a cada 2 anos (anos pares não-municipais)
  // Cron no dia 15 de fevereiro de anos eleitorais federais (2026, 2030...)
  // Por simplicidade, roda anualmente para capturar mudanças de partido, etc.
  @Cron('0 4 1 1 *')   // 1º de janeiro às 04:00 — início do mandato
  async yearlyFederal(): Promise<void> {
    this.logger.log('Disparando sync anual de Presidente + Governadores (TSE)')
    await this.service.triggerSync('presidente-governadores')
  }

  // Eleições municipais: a cada 4 anos (2024, 2028...)
  // Roda também anualmente para capturar mudanças
  @Cron('0 5 1 1 *')   // 1º de janeiro às 05:00
  async yearlyMunicipal(): Promise<void> {
    this.logger.log('Disparando sync anual de Prefeitos + Dep. Estaduais (TSE)')
    await this.service.triggerSync('prefeitos-dep-estaduais')
  }
}
