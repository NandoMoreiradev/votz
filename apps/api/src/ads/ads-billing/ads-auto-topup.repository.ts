import { Injectable } from '@nestjs/common'
import type { AdPaymentProvider } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { MonthRange } from './billing-rules'

export interface AutoTopUpData {
  enabled: boolean
  thresholdCents: number
  amountCents: number
  monthlyLimitCents: number
  provider: AdPaymentProvider
  paymentMethodRef: string | null
  consentAt: Date | null
  consentById: string | null
}

/** Recarga automática: as regras que o anunciante escolheu e o andamento de cada cobrança. */
@Injectable()
export class AdsAutoTopUpRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(accountId: string) {
    return this.prisma.adAutoTopUp.findUnique({ where: { adAccountId: accountId } })
  }

  /** Liga ou muda as regras. Ligar de novo zera as falhas e o motivo de ter parado. */
  upsert(accountId: string, data: AutoTopUpData) {
    const fresh = { ...data, consecutiveFailures: 0, stoppedReason: null }
    return this.prisma.adAutoTopUp.upsert({ where: { adAccountId: accountId }, create: { adAccountId: accountId, ...fresh }, update: fresh })
  }

  disable(accountId: string) {
    return this.prisma.adAutoTopUp.updateMany({ where: { adAccountId: accountId }, data: { enabled: false } })
  }

  /** Quanto já foi recarregado sozinho no mês (pagas e as que esperam pagamento). */
  async usedInMonth(accountId: string, month: MonthRange): Promise<number> {
    const sum = await this.prisma.adTopUp.aggregate({
      where: { adAccountId: accountId, auto: true, status: { in: ['PENDING', 'PAID'] }, createdAt: { gte: month.startAt, lt: month.endAt } },
      _sum: { amountCents: true },
    })
    return sum._sum.amountCents ?? 0
  }

  hasPendingAuto(accountId: string): Promise<boolean> {
    return this.prisma.adTopUp.count({ where: { adAccountId: accountId, auto: true, status: 'PENDING' } }).then((count) => count > 0)
  }

  /** Contas com a recarga automática ligada, com o que a decisão precisa saber. */
  listEnabled() {
    return this.prisma.adAutoTopUp.findMany({
      where: { enabled: true },
      include: {
        adAccount: {
          select: {
            id: true,
            name: true,
            companyId: true,
            balanceCents: true,
            pendingSpendMillicents: true,
            _count: { select: { campaigns: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
    })
  }

  /**
   * Reserva a vez de cobrar: só uma instância passa (a que trocar o carimbo de "última cobrança" primeiro). Evita cobrar
   * duas vezes quando a tarefa roda em mais de uma instância ao mesmo tempo.
   */
  async claim(accountId: string, previous: Date | null, now: Date): Promise<boolean> {
    const moved = await this.prisma.adAutoTopUp.updateMany({
      where: { adAccountId: accountId, enabled: true, lastTriggeredAt: previous },
      data: { lastTriggeredAt: now },
    })
    return moved.count > 0
  }

  async recordFailure(accountId: string): Promise<number> {
    const row = await this.prisma.adAutoTopUp.update({ where: { adAccountId: accountId }, data: { consecutiveFailures: { increment: 1 } }, select: { consecutiveFailures: true } })
    return row.consecutiveFailures
  }

  resetFailures(accountId: string) {
    return this.prisma.adAutoTopUp.updateMany({ where: { adAccountId: accountId }, data: { consecutiveFailures: 0 } })
  }

  /** Para a recarga automática e guarda o motivo (o anunciante lê na tela). */
  stop(accountId: string, reason: string) {
    return this.prisma.adAutoTopUp.updateMany({ where: { adAccountId: accountId }, data: { enabled: false, stoppedReason: reason } })
  }
}
