import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import { TseSyncService, TSE_SYNC_QUEUE } from './tse-sync.service'
import { TseSyncProcessor } from './tse-sync.processor'
import { TseSyncCron } from './tse-sync.cron'
import { TseSyncController } from './tse-sync.controller'

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: TSE_SYNC_QUEUE }),
  ],
  controllers: [TseSyncController],
  providers: [TseSyncService, TseSyncProcessor, TseSyncCron],
  exports: [TseSyncService],
})
export class TseSyncModule {}
