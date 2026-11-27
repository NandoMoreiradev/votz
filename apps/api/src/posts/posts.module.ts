import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { GifsModule } from '../gifs/gifs.module'
import { MailModule } from '../mail/mail.module'
import { MediaModule } from '../media/media.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { StorageModule } from '../storage/storage.module'
import { TopicsModule } from '../topics/topics.module'
import { FeedCursorService } from './feed-cursor.service'
import { FeedRankingCron } from './feed-ranking.cron'
import { FeedRankingProcessor } from './feed-ranking.processor'
import { FEED_RANKING_QUEUE, FeedRankingService } from './feed-ranking.service'
import { PostsController } from './posts.controller'
import { PostsRepository } from './posts.repository'
import { PostsService } from './posts.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: FEED_RANKING_QUEUE }),
    StorageModule,
    MediaModule,
    GifsModule,
    TopicsModule,
    NotificationsModule,
    MailModule,
  ],
  controllers: [PostsController],
  providers: [
    PostsService,
    PostsRepository,
    FeedRankingService,
    FeedCursorService,
    FeedRankingProcessor,
    FeedRankingCron,
  ],
  exports: [PostsService, FeedRankingService],
})
export class PostsModule {}
