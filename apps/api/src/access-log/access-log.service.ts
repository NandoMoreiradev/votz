import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { DAY_MS, windowedJobId } from '../common/queue/job-window'
import { AccessEvent } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export const ACCESS_LOG_RETENTION_QUEUE = 'access-log-retention'
export const ACCESS_LOG_RETENTION_MONTHS = 6

function subtractMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const originalDay = result.getUTCDate()
  result.setUTCMonth(result.getUTCMonth() - months)
  if (result.getUTCDate() !== originalDay) {
    result.setUTCDate(0)
  }
  return result
}

/**
 * Registro mínimo legal de acessos (Marco Civil da Internet, art. 15).
 * Registra apenas eventos de início de sessão (login / Google / verificação MFA);
 * renovações de access token via refresh não são gravadas.
 * Não há endpoint público/admin de leitura: os registros permanecem apenas
 * no banco para atendimento de ordem judicial e na exportação LGPD do titular.
 */
@Injectable()
export class AccessLogService {
  private readonly logger = new Logger(AccessLogService.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(ACCESS_LOG_RETENTION_QUEUE) private readonly queue: Queue,
  ) {}

  async record(userId: string | null | undefined, event: AccessEvent, ip: string): Promise<void> {
    await this.prisma.accessLog
      .create({
        data: {
          userId: userId ?? null,
          event,
          ip: ip?.trim() || 'unknown',
        },
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.warn(`Failed to record access log (${event}): ${message}`)
        return null
      })
  }

  async enqueuePurge(): Promise<void> {
    await this.queue.add(
      'purge-expired',
      {},
      { jobId: windowedJobId('access-log-purge', DAY_MS), removeOnComplete: 10, removeOnFail: 10 },
    )
  }

  async purgeExpired(now = new Date()): Promise<{ deleted: number }> {
    const cutoff = subtractMonths(now, ACCESS_LOG_RETENTION_MONTHS)
    const { count } = await this.prisma.accessLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })

    if (count > 0) {
      this.logger.log(`Purged ${count} access logs older than ${cutoff.toISOString()}`)
    }

    return { deleted: count }
  }
}
