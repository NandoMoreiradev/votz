import { Module } from '@nestjs/common'
import { EntitiesController } from './entities.controller'
import { EntitiesService } from './entities.service'
import { EntitiesRepository } from './entities.repository'
import { PlanGuard } from '../auth/guards/plan.guard'
import { PostsModule } from '../posts/posts.module'

@Module({
  imports: [PostsModule],
  controllers: [EntitiesController],
  providers: [EntitiesService, EntitiesRepository, PlanGuard],
  exports: [EntitiesService],
})
export class EntitiesModule {}
