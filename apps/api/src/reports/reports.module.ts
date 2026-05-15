import { Module } from '@nestjs/common'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { ReportsRepository } from './reports.repository'
import { PressureScoreJob } from './jobs/pressure-score.job'
import { TimelineModule } from '../timeline/timeline.module'

@Module({
  imports: [TimelineModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository, PressureScoreJob],
  exports: [ReportsService],
})
export class ReportsModule {}
