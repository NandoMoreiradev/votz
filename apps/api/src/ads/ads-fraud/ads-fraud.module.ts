import { Module } from '@nestjs/common'
import { NotificationsModule } from '../../notifications/notifications.module'
import { PrismaModule } from '../../prisma/prisma.module'
import { AdsBillingModule } from '../ads-billing/ads-billing.module'
import { AdsFraudRepository } from './ads-fraud.repository'
import { AdsFraudService } from './ads-fraud.service'

/** Antifraude de anúncios. As rotas da fila ficam no módulo de moderação (`/admin/ad-fraud-flags`). */
@Module({
  imports: [PrismaModule, NotificationsModule, AdsBillingModule],
  providers: [AdsFraudService, AdsFraudRepository],
  exports: [AdsFraudService],
})
export class AdsFraudModule {}
