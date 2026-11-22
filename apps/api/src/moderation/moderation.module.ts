import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { CommentsModule } from '../comments/comments.module'
import { PostsModule } from '../posts/posts.module'
import { AdsReviewModule } from '../ads/ads-review/ads-review.module'
import { AdsFraudModule } from '../ads/ads-fraud/ads-fraud.module'
import { AdminAdFraudController, AdminAdReviewsController, AdminFlagsController, ModerationController } from './moderation.controller'
import { ModerationRepository } from './moderation.repository'
import { ModerationService } from './moderation.service'

@Module({
  imports: [AdminModule, CommentsModule, PostsModule, AdsReviewModule, AdsFraudModule],
  controllers: [ModerationController, AdminFlagsController, AdminAdReviewsController, AdminAdFraudController],
  providers: [ModerationService, ModerationRepository],
})
export class ModerationModule {}
