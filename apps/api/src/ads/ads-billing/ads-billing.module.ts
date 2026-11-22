import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { OrgMembershipsModule } from '../../org-memberships/org-memberships.module'
import { AdsBillingController } from './ads-billing.controller'
import { AdsBillingService } from './ads-billing.service'
import { AdsBillingRepository } from './ads-billing.repository'
import { TestPaymentGateway } from './gateways/test-payment.gateway'
import { AsaasPaymentGateway, StripePaymentGateway } from './gateways/live-gateways'

@Module({
  imports: [PrismaModule, OrgMembershipsModule],
  controllers: [AdsBillingController],
  providers: [AdsBillingService, AdsBillingRepository, TestPaymentGateway, AsaasPaymentGateway, StripePaymentGateway],
  exports: [AdsBillingService, AdsBillingRepository],
})
export class AdsBillingModule {}
