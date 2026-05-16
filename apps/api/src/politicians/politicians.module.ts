import { Module } from '@nestjs/common'
import { PoliticiansController } from './politicians.controller'
import { PoliticiansService } from './politicians.service'
import { PoliticiansRepository } from './politicians.repository'
import { TimelineModule } from '../timeline/timeline.module'

@Module({
  imports: [TimelineModule],
  controllers: [PoliticiansController],
  providers: [PoliticiansService, PoliticiansRepository],
  exports: [PoliticiansService],
})
export class PoliticiansModule {}
