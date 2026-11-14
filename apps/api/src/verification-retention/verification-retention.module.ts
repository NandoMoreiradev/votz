import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import {
  VerificationRetentionService,
  VERIFICATION_RETENTION_QUEUE,
} from './verification-retention.service'
import { VerificationRetentionProcessor } from './verification-retention.processor'
import { VerificationRetentionCron } from './verification-retention.cron'

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: VERIFICATION_RETENTION_QUEUE }),
  ],
  providers: [
    VerificationRetentionService,
    VerificationRetentionProcessor,
    VerificationRetentionCron,
  ],
  exports: [VerificationRetentionService],
})
export class VerificationRetentionModule {}
