import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { NotificationsModule } from '../../notifications/notifications.module'
import { PrismaModule } from '../../prisma/prisma.module'
import { AdsLandingProcessor } from './ads-landing.processor'
import { AdsLandingRepository } from './ads-landing.repository'
import { ADS_LANDING_QUEUE, AdsLandingService } from './ads-landing.service'
import { LandingFetcher, SafeLandingFetcher } from './landing-fetcher'

/** Conferência da página de destino dos anúncios. */
@Module({
  imports: [BullModule.registerQueue({ name: ADS_LANDING_QUEUE }), PrismaModule, NotificationsModule],
  providers: [AdsLandingService, AdsLandingProcessor, AdsLandingRepository, { provide: LandingFetcher, useClass: SafeLandingFetcher }],
  exports: [AdsLandingService],
})
export class AdsLandingModule {}
