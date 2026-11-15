import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { PlansModule } from '../plans/plans.module'
import { PrismaModule } from '../prisma/prisma.module'
import { WebhooksController } from './webhooks.controller'
import { WebhooksProcessor } from './webhooks.processor'
import { WEBHOOKS_QUEUE, WebhooksService } from './webhooks.service'

@Module({
  imports: [
    PrismaModule,
    PlansModule,
    BullModule.registerQueue({ name: WEBHOOKS_QUEUE }),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksProcessor],
  exports: [WebhooksService],
})
export class WebhooksModule {}
