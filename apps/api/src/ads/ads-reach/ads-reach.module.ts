import { Module } from '@nestjs/common'
import { OrgMembershipsModule } from '../../org-memberships/org-memberships.module'
import { PrismaModule } from '../../prisma/prisma.module'
import { AdsReachController } from './ads-reach.controller'
import { AdsReachRepository } from './ads-reach.repository'
import { AdsReachService } from './ads-reach.service'

@Module({
  imports: [PrismaModule, OrgMembershipsModule],
  controllers: [AdsReachController],
  providers: [AdsReachService, AdsReachRepository],
  exports: [AdsReachService],
})
export class AdsReachModule {}
