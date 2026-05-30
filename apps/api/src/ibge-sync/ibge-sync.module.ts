import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import { IbgeSyncService, IBGE_SYNC_QUEUE } from './ibge-sync.service'
import { IbgeSyncProcessor } from './ibge-sync.processor'
import { IbgeSyncCron } from './ibge-sync.cron'
import { IbgeSyncController } from './ibge-sync.controller'

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: IBGE_SYNC_QUEUE }),
  ],
  controllers: [IbgeSyncController],
  providers: [IbgeSyncService, IbgeSyncProcessor, IbgeSyncCron],
  exports: [IbgeSyncService],
})
export class IbgeSyncModule {}
