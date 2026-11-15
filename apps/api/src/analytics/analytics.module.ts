import { BullModule } from '@nestjs/bullmq'
import { Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { PlansModule } from '../plans/plans.module'
import { PrismaModule } from '../prisma/prisma.module'
import { ANALYTICS_QUEUE } from './analytics.constants'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsCron } from './analytics.cron'
import { AnalyticsProcessor } from './analytics.processor'
import { AnalyticsRepository } from './analytics.repository'
import { ANALYTICS_REDIS_CLIENT, AnalyticsRollupService } from './analytics.rollup'
import { AnalyticsScopeService } from './analytics.scope'
import { AnalyticsService } from './analytics.service'

@Module({
  imports: [
    PrismaModule,
    PlansModule,
    BullModule.registerQueue({ name: ANALYTICS_QUEUE }),
  ],
  controllers: [AnalyticsController],
  providers: [
    {
      provide: ANALYTICS_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('AnalyticsRedis')
        const url = config.get<string>('REDIS_URL') || 'redis://localhost:6379'
        const client = new Redis(url, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          commandTimeout: 1000,
          lazyConnect: false,
        })
        client.on('error', (err) => logger.warn(`Analytics Redis warning: ${err.message}`))
        return client
      },
    },
    AnalyticsScopeService,
    AnalyticsRepository,
    AnalyticsRollupService,
    AnalyticsService,
    AnalyticsProcessor,
    AnalyticsCron,
  ],
  exports: [AnalyticsService, AnalyticsRollupService],
})
export class AnalyticsModule implements OnModuleDestroy {
  constructor(@Inject(ANALYTICS_REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy() {
    try {
      await this.redis.quit()
    } catch {
      this.redis.disconnect()
    }
  }
}
