import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { WeeklyDigestService } from './weekly-digest.service'

@Injectable()
export class WeeklyDigestCron {
  private readonly logger = new Logger(WeeklyDigestCron.name)

  constructor(private readonly digest: WeeklyDigestService) {}

  // Executa a cada hora para respeitar dia e hora configuráveis (padrão: segunda 08:00 America/Sao_Paulo)
  @Cron('0 * * * *')
  async checkHourlyDigests() {
    try {
      const res = await this.digest.enqueueDueDigests()
      if (res.enqueued > 0) {
        this.logger.log(
          `Resumos semanais enfileirados (${res.weekKey}): ${res.enqueued}`,
        )
      }
    } catch (err) {
      this.logger.warn(`Erro no agendador de resumo semanal: ${err}`)
    }
  }
}
