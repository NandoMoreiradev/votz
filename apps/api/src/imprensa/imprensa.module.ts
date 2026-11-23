import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { SubscricoesModule } from '../subscricoes/subscricoes.module'
import { ImprensaRepository } from './imprensa.repository'
import { ImprensaService } from './imprensa.service'
import { ImprensaController } from './imprensa.controller'
import { PressAccessService } from './press-access.service'
import { PressCredentialsController } from './press-credentials.controller'
import { PressCredentialsRepository } from './press-credentials.repository'
import { PressCredentialsService } from './press-credentials.service'
import { PressPlanController } from './press-plan.controller'
import { PressPlanService } from './press-plan.service'
import { PressRadarController } from './press-radar.controller'
import { PressRadarRepository } from './press-radar.repository'
import { PressRadarService } from './press-radar.service'
import { PRESS_RADAR_QUEUE, PressRadarCron, PressRadarProcessor } from './press-radar.worker'
import { EmbeddingModule } from '../embedding/embedding.module'
import { PressAiController } from './press-ai.controller'
import { PressContactController } from './press-contact.controller'
import { PressContactRepository } from './press-contact.repository'
import { PressContactService } from './press-contact.service'
import { PressBriefingAnalyzer } from './press-briefing.analyzer'
import { PressBriefingRepository } from './press-briefing.repository'
import { PressBriefingService } from './press-briefing.service'
import { PressSearchRepository } from './press-search.repository'
import { PressSearchService } from './press-search.service'

// MailModule é global. Os controllers de imprensa dividem o prefixo /imprensa.
@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    SubscricoesModule,
    EmbeddingModule,
    BullModule.registerQueue({ name: PRESS_RADAR_QUEUE }),
  ],
  controllers: [ImprensaController, PressCredentialsController, PressPlanController, PressRadarController, PressAiController, PressContactController],
  providers: [
    ImprensaService,
    ImprensaRepository,
    PressAccessService,
    PressCredentialsService,
    PressCredentialsRepository,
    PressPlanService,
    PressRadarService,
    PressRadarRepository,
    PressRadarCron,
    PressRadarProcessor,
    PressSearchService,
    PressSearchRepository,
    PressBriefingService,
    PressBriefingRepository,
    PressBriefingAnalyzer,
    PressContactService,
    PressContactRepository,
  ],
  exports: [PressRadarService],
})
export class ImprensaModule {}
