import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import { SenadoSyncService, SENADO_SYNC_QUEUE } from './senado-sync.service'
import { SenadoSyncProcessor } from './senado-sync.processor'
import { SenadoSyncCron } from './senado-sync.cron'
import { SenadoSyncController } from './senado-sync.controller'

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: SENADO_SYNC_QUEUE }),
  ],
  controllers: [SenadoSyncController],
  providers: [SenadoSyncService, SenadoSyncProcessor, SenadoSyncCron],
  exports: [SenadoSyncService],
})
export class SenadoSyncModule {}
