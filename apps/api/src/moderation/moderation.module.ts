import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { CommentsModule } from '../comments/comments.module'
import { PostsModule } from '../posts/posts.module'
import { AdsReviewModule } from '../ads/ads-review/ads-review.module'
import { AdminAdReviewsController, AdminFlagsController, ModerationController } from './moderation.controller'
import { ModerationRepository } from './moderation.repository'
import { ModerationService } from './moderation.service'

@Module({
  imports: [AdminModule, CommentsModule, PostsModule, AdsReviewModule],
  controllers: [ModerationController, AdminFlagsController, AdminAdReviewsController],
  providers: [ModerationService, ModerationRepository],
})
export class ModerationModule {}
