import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AnalyticsModule } from '../analytics/analytics.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlansModule } from '../plans/plans.module'
import { TimelineModule } from '../timeline/timeline.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { SlaController } from './sla.controller'
import { SlaCron } from './sla.cron'
import { SlaProcessor } from './sla.processor'
import { SLA_QUEUE, SlaService } from './sla.service'

@Module({
  imports: [
    PlansModule,
    AnalyticsModule,
    NotificationsModule,
    TimelineModule,
    WebhooksModule,
    BullModule.registerQueue({ name: SLA_QUEUE }),
  ],
  controllers: [SlaController],
  providers: [SlaService, SlaProcessor, SlaCron],
  exports: [SlaService],
})
export class SlaModule {}
