import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { UsersRepository } from './users.repository'
import { LgpdProcessor, LGPD_QUEUE } from './lgpd.processor'
import { MailModule } from '../mail/mail.module'
import { HandlesModule } from '../handles/handles.module'
import { PrismaModule } from '../prisma/prisma.module'
import { AdsViewerModule } from '../ads/ads-viewer/ads-viewer.module'

@Module({
  imports: [
    PrismaModule,
    AdsViewerModule,
    MailModule,
    HandlesModule,
    BullModule.registerQueue({ name: LGPD_QUEUE }),
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, LgpdProcessor],
  exports: [UsersService],
})
export class UsersModule {}
