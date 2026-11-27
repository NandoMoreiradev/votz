import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { ReportsRepository } from './reports.repository'
import { TimelineModule } from '../timeline/timeline.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AlertsModule } from '../alerts/alerts.module'
import { EmbeddingModule } from '../embedding/embedding.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { TopicsModule } from '../topics/topics.module'
import { ReportLifecycleModule } from '../report-lifecycle/report-lifecycle.module'
import { GenerateEmbeddingProcessor, REPORTS_QUEUE } from './jobs/generate-embedding.processor'
import { EmbeddingBackfillCron } from './jobs/embedding-backfill.cron'

@Module({
  imports: [
    TimelineModule,
    NotificationsModule,
    AlertsModule,
    EmbeddingModule,
    WebhooksModule,
    TopicsModule,
    ReportLifecycleModule,
    BullModule.registerQueue({ name: REPORTS_QUEUE }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository, GenerateEmbeddingProcessor, EmbeddingBackfillCron],
  exports: [ReportsService],
})
export class ReportsModule {}
