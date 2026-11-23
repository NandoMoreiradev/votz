import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AdminContextNotesController, ContextNotesController } from './context-notes.controller'
import { CONTEXT_NOTES_QUEUE, ContextNotesCron, ContextNotesProcessor } from './context-notes.jobs'
import { ContextNotesRepository } from './context-notes.repository'
import { ContextNotesService } from './context-notes.service'

@Module({
  imports: [BullModule.registerQueue({ name: CONTEXT_NOTES_QUEUE }), NotificationsModule, MailModule],
  controllers: [ContextNotesController, AdminContextNotesController],
  providers: [ContextNotesService, ContextNotesRepository, ContextNotesCron, ContextNotesProcessor],
  exports: [ContextNotesService],
})
export class ContextNotesModule {}
