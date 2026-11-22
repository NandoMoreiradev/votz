import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { AdsPreferencesController } from './ads-preferences.controller'
import { AdsPreferencesService } from './ads-preferences.service'
import { AdsPreferencesRepository } from './ads-preferences.repository'

@Module({
  imports: [PrismaModule],
  controllers: [AdsPreferencesController],
  providers: [AdsPreferencesService, AdsPreferencesRepository],
  exports: [AdsPreferencesService],
})
export class AdsPreferencesModule {}
