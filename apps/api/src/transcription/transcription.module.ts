import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TranscriptionService, TRANSCRIPTION_QUEUE } from './transcription.service'
import { TranscriptionProcessor } from './transcription.processor'

@Module({
  imports: [BullModule.registerQueue({ name: TRANSCRIPTION_QUEUE })],
  providers: [TranscriptionService, TranscriptionProcessor],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
