import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AdsReviewModule } from '../ads-review/ads-review.module'
import { AdsAnalyzer, GeminiAdsAnalyzer } from './ads-analyzer'
import { ADS_AI_REVIEW_QUEUE, AdsAiReviewService } from './ads-ai-review.service'
import { AdsAiReviewProcessor } from './ads-ai-review.processor'

/** Leitura do anúncio pela IA antes da fila humana. */
@Module({
  imports: [BullModule.registerQueue({ name: ADS_AI_REVIEW_QUEUE }), AdsReviewModule],
  providers: [AdsAiReviewService, AdsAiReviewProcessor, { provide: AdsAnalyzer, useClass: GeminiAdsAnalyzer }],
  exports: [AdsAiReviewService],
})
export class AdsAiReviewModule {}
