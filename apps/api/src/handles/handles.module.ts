import { Module } from '@nestjs/common'
import { OrgMembershipsModule } from '../org-memberships/org-memberships.module'
import { HandlesController } from './handles.controller'
import { HandlesService } from './handles.service'

@Module({
  imports: [OrgMembershipsModule],
  controllers: [HandlesController],
  providers: [HandlesService],
  exports: [HandlesService],
})
export class HandlesModule {}
