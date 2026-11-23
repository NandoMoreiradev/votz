import { Injectable, Logger } from '@nestjs/common'
import type { NotificationType } from '@prisma/client'
import { NotificationsService } from '../../notifications/notifications.service'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * Avisa quem gerencia os anúncios da empresa (sino do site). Falhar aqui nunca desfaz o que aconteceu com o dinheiro:
 * o anunciante ainda vê tudo na tela de Faturamento.
 */
@Injectable()
export class AdvertiserNotifier {
  private readonly logger = new Logger(AdvertiserNotifier.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notify(companyId: string, type: NotificationType, metadata: Record<string, unknown>): Promise<void> {
    try {
      const members = await this.prisma.orgMembership.findMany({
        where: { orgType: 'COMPANY', orgId: companyId, status: 'ACTIVE', role: { permissions: { has: 'MANAGE_ADS' } } },
        select: { userId: true },
      })
      await Promise.all(members.map((member) => this.notifications.notify({ userId: member.userId, type, metadata })))
    } catch (error) {
      this.logger.warn(`Aviso ${type} da empresa ${companyId} falhou: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
