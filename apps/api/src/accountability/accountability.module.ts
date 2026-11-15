import { BullModule } from '@nestjs/bullmq'
import { Injectable, Logger, Module } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { AnalyticsModule } from '../analytics/analytics.module'
import { PlansModule } from '../plans/plans.module'
import { PrismaModule } from '../prisma/prisma.module'
import { AccountabilityController } from './accountability.controller'
import { AccountabilityProcessor } from './accountability.processor'
import { ACCOUNTABILITY_QUEUE, AccountabilityService } from './accountability.service'
import { ReportRendererService } from './report-renderer.service'

@Injectable()
export class AccountabilityCron {
  private readonly logger = new Logger(AccountabilityCron.name)

  constructor(private readonly service: AccountabilityService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<void> {
    this.logger.log('Running 7-day accountability PDF retention cleanup')
    await this.service.purgeExpiredPdfs()
  }
}

@Module({
  imports: [
    PrismaModule,
    PlansModule,
    AnalyticsModule,
    BullModule.registerQueue({ name: ACCOUNTABILITY_QUEUE }),
  ],
  controllers: [AccountabilityController],
  providers: [
    ReportRendererService,
    AccountabilityService,
    AccountabilityProcessor,
    AccountabilityCron,
  ],
  exports: [ReportRendererService, AccountabilityService],
})
export class AccountabilityModule {}
