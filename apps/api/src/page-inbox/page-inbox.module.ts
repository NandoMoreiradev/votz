import { Module } from '@nestjs/common'
import { OrgMembershipsModule } from '../org-memberships/org-memberships.module'
import { PageInboxController } from './page-inbox.controller'
import { PageInboxService } from './page-inbox.service'

@Module({
  imports: [OrgMembershipsModule],
  controllers: [PageInboxController],
  providers: [PageInboxService],
  exports: [PageInboxService],
})
export class PageInboxModule {}
