import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { ReportsRepository } from './reports.repository'
import { TimelineModule } from '../timeline/timeline.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AlertsModule } from '../alerts/alerts.module'
import { EmbeddingModule } from '../embedding/embedding.module'
import { GenerateEmbeddingProcessor, REPORTS_QUEUE } from './jobs/generate-embedding.processor'

@Module({
  imports: [
    TimelineModule,
    NotificationsModule,
    AlertsModule,
    EmbeddingModule,
    BullModule.registerQueue({ name: REPORTS_QUEUE }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository, GenerateEmbeddingProcessor],
  exports: [ReportsService],
})
export class ReportsModule {}
