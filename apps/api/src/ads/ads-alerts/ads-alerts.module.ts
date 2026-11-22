import { Module } from '@nestjs/common'
import { NotificationsModule } from '../../notifications/notifications.module'
import { PrismaModule } from '../../prisma/prisma.module'
import { AdsAlertsRepository } from './ads-alerts.repository'
import { AdsAlertsService } from './ads-alerts.service'

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [AdsAlertsService, AdsAlertsRepository],
  exports: [AdsAlertsService],
})
export class AdsAlertsModule {}
