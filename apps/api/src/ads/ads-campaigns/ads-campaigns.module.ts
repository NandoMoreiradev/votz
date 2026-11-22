import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { OrgMembershipsModule } from '../../org-memberships/org-memberships.module'
import { MediaModule } from '../../media/media.module'
import { AdsAiReviewModule } from '../ads-ai-review/ads-ai-review.module'
import { AdsLandingModule } from '../ads-landing/ads-landing.module'
import { AdsCampaignsController } from './ads-campaigns.controller'
import { AdsCampaignsService } from './ads-campaigns.service'
import { AdsCampaignsRepository } from './ads-campaigns.repository'

@Module({
  imports: [PrismaModule, OrgMembershipsModule, AdsAiReviewModule, AdsLandingModule, MediaModule],
  controllers: [AdsCampaignsController],
  providers: [AdsCampaignsService, AdsCampaignsRepository],
  exports: [AdsCampaignsService],
})
export class AdsCampaignsModule {}
