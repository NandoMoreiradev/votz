import { Module } from '@nestjs/common'
import { TopicsController } from './topics.controller'
import { TopicsService } from './topics.service'
import { TopicsRepository } from './topics.repository'

@Module({
  controllers: [TopicsController],
  providers: [TopicsService, TopicsRepository],
  exports: [TopicsService],
})
export class TopicsModule {}
