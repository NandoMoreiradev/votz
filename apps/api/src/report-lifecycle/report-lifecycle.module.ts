import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { NotificationsModule } from '../notifications/notifications.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { PressModule } from '../press/press.module'
import { PostsModule } from '../posts/posts.module'
import { ShareCardsModule } from '../share-cards/share-cards.module'
import { ReportLifecycleService } from './report-lifecycle.service'
import { ReportLifecycleEffects } from './report-lifecycle.effects'
import { MandatometerService } from './mandatometer.service'
import { AdvocacyDeadlineService } from './advocacy-deadline.service'
import { ReportLifecycleProcessor } from './report-lifecycle.processor'
import { ReportLifecycleCron } from './report-lifecycle.cron'
import { LIFECYCLE_QUEUE } from './report-lifecycle.types'

/** Porta única para mudar relatos (avocar, atualizar, status, contestação) e o Mandatômetro. */
@Module({
  imports: [
    NotificationsModule,
    WebhooksModule,
    PressModule,
    PostsModule,
    ShareCardsModule,
    BullModule.registerQueue({ name: LIFECYCLE_QUEUE }),
  ],
  providers: [
    ReportLifecycleService,
    ReportLifecycleEffects,
    MandatometerService,
    AdvocacyDeadlineService,
    ReportLifecycleProcessor,
    ReportLifecycleCron,
  ],
  exports: [ReportLifecycleService, MandatometerService, ReportLifecycleEffects],
})
export class ReportLifecycleModule {}
