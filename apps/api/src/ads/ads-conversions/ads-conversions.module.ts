import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { OrgMembershipsModule } from '../../org-memberships/org-memberships.module'
import { AdsClickLinkService } from './ads-click-link.service'
import { AdsClickController, AdsConversionKeysController, AdsConversionsController } from './ads-conversions.controller'
import { AdsConversionsRepository } from './ads-conversions.repository'
import { AdsConversionsService } from './ads-conversions.service'
import { ConversionKeyGuard } from './conversion-key.guard'

@Module({
  imports: [PrismaModule, OrgMembershipsModule],
  controllers: [AdsClickController, AdsConversionsController, AdsConversionKeysController],
  providers: [AdsConversionsService, AdsConversionsRepository, AdsClickLinkService, ConversionKeyGuard],
  exports: [AdsClickLinkService],
})
export class AdsConversionsModule {}
