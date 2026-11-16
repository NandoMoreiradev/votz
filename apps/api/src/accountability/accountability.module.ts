import { BullModule, InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger, Module } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { Queue } from 'bullmq'
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

  constructor(
    private readonly service: AccountabilityService,
    @InjectQueue(ACCOUNTABILITY_QUEUE) private readonly queue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<void> {
    this.logger.log('Running 7-day accountability PDF retention cleanup')
    await this.service.purgeExpiredPdfs()
  }

  @Cron('0 6 1 * *')
  async scheduleMonthlyEntityAutoReports(): Promise<void> {
    const monthKey = new Date().toISOString().slice(0, 7)
    await this.queue.add(
      'monthly-entity-auto-reports',
      {},
      {
        jobId: `accountability-monthly-${monthKey}`,
        removeOnComplete: 12,
        removeOnFail: 12,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    )
    this.logger.log(`Job mensal de relatórios automáticos das entidades enfileirado (${monthKey})`)
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
