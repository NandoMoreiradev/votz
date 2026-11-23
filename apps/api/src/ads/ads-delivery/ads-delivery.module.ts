import { Module } from '@nestjs/common'
import { ContentAdjacencyModule } from '../../content-adjacency/content-adjacency.module'
import { PrismaModule } from '../../prisma/prisma.module'
import { OrgMembershipsModule } from '../../org-memberships/org-memberships.module'
import { AdsBillingModule } from '../ads-billing/ads-billing.module'
import { AdsConversionsModule } from '../ads-conversions/ads-conversions.module'
import { AdsViewerModule } from '../ads-viewer/ads-viewer.module'
import { AdsDeliveryController, AdsStatsController } from './ads-delivery.controller'
import { AdsDeliveryRepository } from './ads-delivery.repository'
import { AdsPacingService } from './ads-pacing.service'
import { AdsUserStateService } from './ads-user-state.service'
import { AdsDeliveryService } from './ads-delivery.service'

@Module({
  imports: [PrismaModule, OrgMembershipsModule, AdsBillingModule, AdsConversionsModule, ContentAdjacencyModule, AdsViewerModule],
  controllers: [AdsDeliveryController, AdsStatsController],
  providers: [AdsDeliveryService, AdsDeliveryRepository, AdsPacingService, AdsUserStateService],
  exports: [AdsDeliveryService],
})
export class AdsDeliveryModule {}
