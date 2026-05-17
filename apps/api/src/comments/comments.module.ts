import { Module } from '@nestjs/common'
import { CommentsController } from './comments.controller'
import { CommentsService } from './comments.service'
import { CommentsRepository } from './comments.repository'
import { NotificationsModule } from '../notifications/notifications.module'
import { PressModule } from '../press/press.module'

@Module({
  imports: [NotificationsModule, PressModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentsRepository],
})
export class CommentsModule {}
