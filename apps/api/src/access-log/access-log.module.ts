import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import { AccessLogService, ACCESS_LOG_RETENTION_QUEUE } from './access-log.service'
import { AccessLogProcessor } from './access-log.processor'
import { AccessLogCron } from './access-log.cron'

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: ACCESS_LOG_RETENTION_QUEUE }),
  ],
  providers: [AccessLogService, AccessLogProcessor, AccessLogCron],
  exports: [AccessLogService],
})
export class AccessLogModule {}
