import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AnalyticsModule } from '../analytics/analytics.module'
import { ShareCardRendererService } from './share-card-renderer.service'
import { ShareCardsController } from './share-cards.controller'
import { ShareCardsProcessor } from './share-cards.processor'
import { SHARE_CARDS_QUEUE, ShareCardsService } from './share-cards.service'

@Module({
  imports: [
    AnalyticsModule,
    BullModule.registerQueue({ name: SHARE_CARDS_QUEUE }),
  ],
  controllers: [ShareCardsController],
  providers: [ShareCardsService, ShareCardRendererService, ShareCardsProcessor],
  exports: [ShareCardsService, ShareCardRendererService],
})
export class ShareCardsModule {}
