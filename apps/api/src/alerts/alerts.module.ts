import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ImprensaModule } from '../imprensa/imprensa.module'
import { MailModule } from '../mail/mail.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlansModule } from '../plans/plans.module'
import { PrismaModule } from '../prisma/prisma.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { AlertRulesController } from './alert-rules.controller'
import { AlertRulesService } from './alert-rules.service'
import { AlertsController } from './alerts.controller'
import { AlertsCron } from './alerts.cron'
import { AlertsProcessor } from './alerts.processor'
import { AlertsRepository } from './alerts.repository'
import { AlertsService, ALERTS_QUEUE } from './alerts.service'

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    MailModule,
    PlansModule,
    WebhooksModule,
    ImprensaModule,
    BullModule.registerQueue({ name: ALERTS_QUEUE }),
  ],
  // AlertRulesController precisa vir antes de AlertsController (:id) para /alerts/rules não colidir com :id
  controllers: [AlertRulesController, AlertsController],
  providers: [AlertsService, AlertRulesService, AlertsRepository, AlertsProcessor, AlertsCron],
  exports: [AlertsService, AlertRulesService],
})
export class AlertsModule {}
