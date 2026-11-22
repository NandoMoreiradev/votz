import { Module } from '@nestjs/common'
import { ContentAdjacencyModule } from '../../content-adjacency/content-adjacency.module'
import { PrismaModule } from '../../prisma/prisma.module'
import { OrgMembershipsModule } from '../../org-memberships/org-memberships.module'
import { AdsBillingModule } from '../ads-billing/ads-billing.module'
import { AdsConversionsModule } from '../ads-conversions/ads-conversions.module'
import { AdsDeliveryController, AdsStatsController } from './ads-delivery.controller'
import { AdsDeliveryRepository } from './ads-delivery.repository'
import { AdsDeliveryService } from './ads-delivery.service'

@Module({
  imports: [PrismaModule, OrgMembershipsModule, AdsBillingModule, AdsConversionsModule, ContentAdjacencyModule],
  controllers: [AdsDeliveryController, AdsStatsController],
  providers: [AdsDeliveryService, AdsDeliveryRepository],
  exports: [AdsDeliveryService],
})
export class AdsDeliveryModule {}
