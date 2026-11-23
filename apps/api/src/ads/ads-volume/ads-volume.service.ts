import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { VOLUME_WATCH, volumeAlerts, type TableVolume, type VolumeAlert } from './volume-rules'

/**
 * Vigia o tamanho das tabelas de anúncio que crescem com o tráfego e avisa no log (uma vez por dia) quando alguma passa
 * do limite, para a decisão de particionar (ou arquivar) ser tomada antes de a consulta ficar lenta, e não depois.
 * Só lê estatísticas do banco (nada de dados de pessoas) e nunca derruba nada: se a leitura falhar, só registra.
 */
@Injectable()
export class AdsVolumeService {
  private readonly logger = new Logger(AdsVolumeService.name)

  constructor(private readonly prisma: PrismaService) {}

  @Cron('30 4 * * *', { timeZone: 'America/Sao_Paulo' })
  async scheduled(): Promise<void> {
    try {
      for (const alert of await this.check()) this.logger.warn(alert.message)
    } catch (error) {
      this.logger.warn(`Não consegui medir o tamanho das tabelas de anúncio: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Mede e devolve só o que passou do limite. */
  async check(): Promise<VolumeAlert[]> {
    return volumeAlerts(await this.measure())
  }

  /** Linhas (estimativa do planejador) e bytes de cada tabela vigiada. Consulta fixa, sem dado de entrada. */
  async measure(): Promise<TableVolume[]> {
    const names = VOLUME_WATCH.map((rule) => rule.table)
    const rows = await this.prisma.$queryRaw<{ relname: string; rows: bigint | number; bytes: bigint | number }[]>(
      Prisma.sql`SELECT c.relname AS relname, GREATEST(c.reltuples, 0)::bigint AS rows, pg_total_relation_size(c.oid)::bigint AS bytes
                 FROM pg_class c
                 WHERE c.relkind IN ('r', 'p') AND c.relname IN (${Prisma.join(names)})`,
    )
    return rows.map((row) => ({ table: row.relname, rows: Number(row.rows), bytes: Number(row.bytes) }))
  }
}
