import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { CryptoModule } from '../crypto/crypto.module'
import { AdminSurveysController, SurveysController } from './surveys.controller'
import { SurveysCron, SurveysProcessor } from './surveys.jobs'
import { SURVEYS_QUEUE } from './surveys.queue'
import { SurveysRepository } from './surveys.repository'
import { SurveysService } from './surveys.service'

@Module({
  imports: [BullModule.registerQueue({ name: SURVEYS_QUEUE }), CryptoModule],
  controllers: [SurveysController, AdminSurveysController],
  providers: [SurveysService, SurveysRepository, SurveysCron, SurveysProcessor],
  exports: [SurveysService],
})
export class SurveysModule {}
