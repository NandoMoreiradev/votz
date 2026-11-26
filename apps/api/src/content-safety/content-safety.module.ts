import { Global, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ContentSafetyAnalyzer, GeminiContentSafetyAnalyzer } from './content-safety.analyzer'
import { CONTENT_SAFETY_QUEUE, ContentSafetyProcessor } from './content-safety.processor'
import { ContentSafetyService } from './content-safety.service'

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: CONTENT_SAFETY_QUEUE })],
  providers: [
    ContentSafetyService,
    ContentSafetyProcessor,
    { provide: ContentSafetyAnalyzer, useClass: GeminiContentSafetyAnalyzer },
  ],
  exports: [ContentSafetyService],
})
export class ContentSafetyModule {}
