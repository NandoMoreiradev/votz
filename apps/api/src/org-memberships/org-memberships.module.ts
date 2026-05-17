import { Module } from '@nestjs/common'
import { OrgMembershipsController } from './org-memberships.controller'
import { OrgMembershipsService } from './org-memberships.service'
import { OrgMembershipsRepository } from './org-memberships.repository'
import { OrgPermissionGuard } from './org-memberships.guard'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [OrgMembershipsController],
  providers: [OrgMembershipsService, OrgMembershipsRepository, OrgPermissionGuard],
  exports: [OrgMembershipsRepository, OrgPermissionGuard],
})
export class OrgMembershipsModule {}
