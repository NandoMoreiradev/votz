import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { StorageModule } from '../storage/storage.module'
import { ConversationsController } from './conversations.controller'
import { ConversationsService } from './conversations.service'
import { ConversationsOutbox } from './conversations.outbox'
import { ConversationsPrivacyInterceptor } from './conversations-privacy.interceptor'
import { ChatController } from './chat.controller'
import { ChatMatrixService } from './chat-matrix.service'
import { ChatService } from './chat.service'

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [ConversationsController, ChatController],
  providers: [ConversationsService, ConversationsOutbox, ConversationsPrivacyInterceptor, ChatMatrixService, ChatService],
})
export class ConversationsModule {}
