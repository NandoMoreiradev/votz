import { Module } from '@nestjs/common'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { ReportsRepository } from './reports.repository'
import { TimelineModule } from '../timeline/timeline.module'

@Module({
  imports: [TimelineModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
  exports: [ReportsService],
})
export class ReportsModule {}
