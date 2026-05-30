import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import { CamaraSyncService, CAMARA_SYNC_QUEUE } from './camara-sync.service'
import { CamaraSyncProcessor } from './camara-sync.processor'
import { CamaraSyncCron } from './camara-sync.cron'
import { CamaraSyncController } from './camara-sync.controller'

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: CAMARA_SYNC_QUEUE }),
  ],
  controllers: [CamaraSyncController],
  providers: [CamaraSyncService, CamaraSyncProcessor, CamaraSyncCron],
  exports: [CamaraSyncService],
})
export class CamaraSyncModule {}
