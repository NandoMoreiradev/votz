import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import { ReportLifecycleModule } from '../report-lifecycle/report-lifecycle.module'
import { MandateExpiryService, MANDATE_EXPIRY_QUEUE } from './mandate-expiry.service'
import { MandateExpiryProcessor } from './mandate-expiry.processor'
import { MandateExpiryCron } from './mandate-expiry.cron'

@Module({
  imports: [
    PrismaModule,
    ReportLifecycleModule,
    BullModule.registerQueue({ name: MANDATE_EXPIRY_QUEUE }),
  ],
  providers: [MandateExpiryService, MandateExpiryProcessor, MandateExpiryCron],
  exports: [MandateExpiryService],
})
export class MandateExpiryModule {}
