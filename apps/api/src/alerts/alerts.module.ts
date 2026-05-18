import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { MailModule } from '../mail/mail.module'
import { AlertsService, ALERTS_QUEUE } from './alerts.service'
import { AlertsRepository } from './alerts.repository'
import { AlertsProcessor } from './alerts.processor'
import { AlertsCron } from './alerts.cron'
import { AlertsController } from './alerts.controller'

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    MailModule,
    BullModule.registerQueue({ name: ALERTS_QUEUE }),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsRepository, AlertsProcessor, AlertsCron],
  exports: [AlertsService],
})
export class AlertsModule {}
