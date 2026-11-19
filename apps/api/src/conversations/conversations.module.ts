import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { NotificationsModule } from '../notifications/notifications.module'
import { StorageModule } from '../storage/storage.module'
import { ConversationsController } from './conversations.controller'
import { ConversationsService } from './conversations.service'
import { ConversationsOutbox } from './conversations.outbox'
import { ConversationsPrivacyInterceptor } from './conversations-privacy.interceptor'
import { ChatController } from './chat.controller'
import { ChatMatrixService } from './chat-matrix.service'
import { ChatService } from './chat.service'
import { CHAT_PUSH_QUEUE, ChatPushProcessor } from './chat-push.processor'

@Module({
  imports: [
    NotificationsModule,
    StorageModule,
    BullModule.registerQueue({ name: CHAT_PUSH_QUEUE }),
  ],
  controllers: [ConversationsController, ChatController],
  providers: [
    ConversationsService,
    ConversationsOutbox,
    ConversationsPrivacyInterceptor,
    ChatMatrixService,
    ChatService,
    ChatPushProcessor,
  ],
})
export class ConversationsModule {}
