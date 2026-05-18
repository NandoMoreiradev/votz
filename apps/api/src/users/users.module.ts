import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { UsersRepository } from './users.repository'
import { LgpdProcessor, LGPD_QUEUE } from './lgpd.processor'
import { MailModule } from '../mail/mail.module'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [
    PrismaModule,
    MailModule,
    BullModule.registerQueue({ name: LGPD_QUEUE }),
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, LgpdProcessor],
  exports: [UsersService],
})
export class UsersModule {}
