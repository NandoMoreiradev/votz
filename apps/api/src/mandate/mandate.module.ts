import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AnalyticsModule } from '../analytics/analytics.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { ShareCardsModule } from '../share-cards/share-cards.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { MandateTemplatesService } from './mandate-templates.service'
import { MandateController } from './mandate.controller'
import { MandateService } from './mandate.service'
import { WeeklyDigestCron } from './weekly-digest.cron'
import { WeeklyDigestProcessor } from './weekly-digest.processor'
import { WEEKLY_DIGEST_QUEUE, WeeklyDigestService } from './weekly-digest.service'

@Module({
  imports: [
    AnalyticsModule,
    NotificationsModule,
    WebhooksModule,
    ShareCardsModule,
    BullModule.registerQueue({ name: WEEKLY_DIGEST_QUEUE }),
  ],
  controllers: [MandateController],
  providers: [
    MandateService,
    MandateTemplatesService,
    WeeklyDigestService,
    WeeklyDigestProcessor,
    WeeklyDigestCron,
  ],
  exports: [MandateService, MandateTemplatesService, WeeklyDigestService],
})
export class MandateModule {}
