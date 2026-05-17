import { Module } from '@nestjs/common'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { ReportsRepository } from './reports.repository'
import { TimelineModule } from '../timeline/timeline.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [TimelineModule, NotificationsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
  exports: [ReportsService],
})
export class ReportsModule {}
