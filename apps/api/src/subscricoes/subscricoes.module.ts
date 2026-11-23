import { Module } from '@nestjs/common'
import { SubscricoesController } from './subscricoes.controller'
import { SubscricoesService } from './subscricoes.service'
import { OrgMembershipsModule } from '../org-memberships/org-memberships.module'

@Module({
  imports: [OrgMembershipsModule],
  controllers: [SubscricoesController],
  providers: [SubscricoesService],
  exports: [SubscricoesService],
})
export class SubscricoesModule {}
