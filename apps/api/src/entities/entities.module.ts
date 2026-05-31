import { Module } from '@nestjs/common'
import { EntitiesController } from './entities.controller'
import { EntitiesService } from './entities.service'
import { EntitiesRepository } from './entities.repository'
import { PlanGuard } from '../auth/guards/plan.guard'

@Module({
  controllers: [EntitiesController],
  providers: [EntitiesService, EntitiesRepository, PlanGuard],
  exports: [EntitiesService],
})
export class EntitiesModule {}
