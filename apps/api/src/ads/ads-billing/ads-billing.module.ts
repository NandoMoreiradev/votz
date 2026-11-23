import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { NotificationsModule } from '../../notifications/notifications.module'
import { OrgMembershipsModule } from '../../org-memberships/org-memberships.module'
import { AdminAdRefundsController, AdsBillingController } from './ads-billing.controller'
import { AdsBillingService } from './ads-billing.service'
import { AdsBillingRepository } from './ads-billing.repository'
import { AdsRefundsRepository } from './ads-refunds.repository'
import { AdsRefundsService } from './ads-refunds.service'
import { AdsAutoTopUpRepository } from './ads-auto-topup.repository'
import { AdsAutoTopUpService } from './ads-auto-topup.service'
import { AdvertiserNotifier } from './advertiser-notifier'
import { AdsInvoicesRepository } from './invoices/ads-invoices.repository'
import { AdsInvoicesService } from './invoices/ads-invoices.service'
import { LiveInvoiceIssuer, TestInvoiceIssuer } from './invoices/invoice-issuer'
import { TestPaymentGateway } from './gateways/test-payment.gateway'
import { AsaasPaymentGateway, StripePaymentGateway } from './gateways/live-gateways'

@Module({
  imports: [PrismaModule, OrgMembershipsModule, NotificationsModule],
  controllers: [AdsBillingController, AdminAdRefundsController],
  providers: [
    AdsBillingService,
    AdsBillingRepository,
    AdsRefundsRepository,
    AdsRefundsService,
    AdsAutoTopUpRepository,
    AdsAutoTopUpService,
    AdsInvoicesRepository,
    AdsInvoicesService,
    TestInvoiceIssuer,
    LiveInvoiceIssuer,
    AdvertiserNotifier,
    TestPaymentGateway,
    AsaasPaymentGateway,
    StripePaymentGateway,
  ],
  exports: [AdsBillingService, AdsBillingRepository],
})
export class AdsBillingModule {}
