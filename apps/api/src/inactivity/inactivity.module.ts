import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import { MailModule } from '../mail/mail.module'
import { UsersModule } from '../users/users.module'
import { InactivityService, INACTIVITY_QUEUE } from './inactivity.service'
import { InactivityProcessor } from './inactivity.processor'
import { InactivityCron } from './inactivity.cron'

@Module({
  imports: [
    PrismaModule,
    MailModule,
    UsersModule,
    BullModule.registerQueue({ name: INACTIVITY_QUEUE }),
  ],
  providers: [InactivityService, InactivityProcessor, InactivityCron],
  exports: [InactivityService],
})
export class InactivityModule {}
