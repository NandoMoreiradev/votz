import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

const LIVE_SET = { status: { notIn: ['PAUSED', 'ARCHIVED', 'DRAFT'] as ('PAUSED' | 'ARCHIVED' | 'DRAFT')[] } }

/** Só contas de anúncios, campanhas e quem da empresa gerencia anúncios. Nada de pessoa fora da equipe, relato ou voto. */
@Injectable()
export class AdsAlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Contas cujas campanhas pausaram por falta de saldo e que ainda não foram avisadas dessa pausa. */
  async accountsPausedWithoutNotice() {
    const rows = await this.prisma.adAccount.findMany({
      where: { pausedForBalanceAt: { not: null } },
      select: { id: true, name: true, companyId: true, pausedForBalanceAt: true, pausedAlertSentAt: true },
    })
    return rows.filter((row) => row.pausedForBalanceAt && (!row.pausedAlertSentAt || row.pausedAlertSentAt < row.pausedForBalanceAt))
  }

  /**
   * Avisa uma vez só mesmo com duas instâncias da API rodando: quem trocar o carimbo primeiro ganha, o outro recebe `false`.
   * `previous` é o carimbo que lemos (nulo ou data).
   */
  async claimPausedNotice(accountId: string, previous: Date | null, now: Date): Promise<boolean> {
    const claimed = await this.prisma.adAccount.updateMany({ where: { id: accountId, pausedAlertSentAt: previous }, data: { pausedAlertSentAt: now } })
    return claimed.count === 1
  }

  /** Contas com campanha ligada (para ver se o saldo está baixo) ou que já foram avisadas (para zerar quando se recuperar). */
  accountsForLowBalanceCheck(now: Date) {
    return this.prisma.adAccount.findMany({
      where: { OR: [{ lowBalanceAlertedAt: { not: null } }, { campaigns: { some: { status: 'ACTIVE' } } }] },
      select: {
        id: true,
        name: true,
        companyId: true,
        balanceCents: true,
        pendingSpendMillicents: true,
        lowBalanceAlertedAt: true,
        campaigns: {
          where: { status: 'ACTIVE' },
          select: {
            adSets: {
              where: { ...LIVE_SET, startAt: { lte: now }, OR: [{ endAt: null }, { endAt: { gt: now } }] },
              select: { dailyBudgetCents: true },
            },
          },
        },
      },
    })
  }

  async claimLowBalanceNotice(accountId: string, now: Date): Promise<boolean> {
    const claimed = await this.prisma.adAccount.updateMany({ where: { id: accountId, lowBalanceAlertedAt: null }, data: { lowBalanceAlertedAt: now } })
    return claimed.count === 1
  }

  async resetLowBalanceNotice(accountId: string): Promise<void> {
    await this.prisma.adAccount.updateMany({ where: { id: accountId, lowBalanceAlertedAt: { not: null } }, data: { lowBalanceAlertedAt: null } })
  }

  /** Quem da empresa gerencia anúncios (dono e papéis com a permissão). */
  async findAdvertiserUserIds(companyId: string): Promise<string[]> {
    const members = await this.prisma.orgMembership.findMany({
      where: { orgType: 'COMPANY', orgId: companyId, status: 'ACTIVE', role: { permissions: { has: 'MANAGE_ADS' } } },
      select: { userId: true },
    })
    return members.map((member) => member.userId)
  }
}
