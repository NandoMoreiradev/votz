import { Module } from '@nestjs/common'
import { CommentsController } from './comments.controller'
import { CommentsService } from './comments.service'
import { CommentsRepository } from './comments.repository'
import { NotificationsModule } from '../notifications/notifications.module'
import { PressModule } from '../press/press.module'
import { TranscriptionModule } from '../transcription/transcription.module'

@Module({
  imports: [NotificationsModule, PressModule, TranscriptionModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentsRepository],
})
export class CommentsModule {}
