import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { DEBATES_QUEUE } from './debates.service'
import { DebatesService } from './debates.service'
import { DebatesRepository } from './debates.repository'
import { DebatesController } from './debates.controller'
import { DebatesGateway } from './debates.gateway'
import { DebatesProcessor } from './debates.processor'

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    BullModule.registerQueue({ name: DEBATES_QUEUE }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [DebatesController],
  providers: [DebatesService, DebatesRepository, DebatesGateway, DebatesProcessor],
  exports: [DebatesService],
})
export class DebatesModule {}
