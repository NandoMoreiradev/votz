import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import { PressureService, PRESSURE_QUEUE } from './pressure.service'
import { PressureProcessor } from './pressure.processor'
import { PressureCron } from './pressure.cron'

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: PRESSURE_QUEUE }),
  ],
  providers: [PressureService, PressureProcessor, PressureCron],
  exports: [PressureService],
})
export class PressModule {}
