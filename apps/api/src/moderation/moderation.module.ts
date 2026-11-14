import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { CommentsModule } from '../comments/comments.module'
import { AdminFlagsController, ModerationController } from './moderation.controller'
import { ModerationRepository } from './moderation.repository'
import { ModerationService } from './moderation.service'

@Module({
  imports: [AdminModule, CommentsModule],
  controllers: [ModerationController, AdminFlagsController],
  providers: [ModerationService, ModerationRepository],
})
export class ModerationModule {}
