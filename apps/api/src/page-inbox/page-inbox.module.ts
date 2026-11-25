import { Module } from '@nestjs/common'
import { OrgMembershipsModule } from '../org-memberships/org-memberships.module'
import { StorageModule } from '../storage/storage.module'
import { AdsConversionsModule } from '../ads/ads-conversions/ads-conversions.module'
import { PageInboxController } from './page-inbox.controller'
import { PageInboxService } from './page-inbox.service'

@Module({
  imports: [OrgMembershipsModule, StorageModule, AdsConversionsModule],
  controllers: [PageInboxController],
  providers: [PageInboxService],
  exports: [PageInboxService],
})
export class PageInboxModule {}
