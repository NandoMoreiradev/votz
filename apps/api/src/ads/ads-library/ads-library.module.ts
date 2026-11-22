import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { AdsLibraryController } from './ads-library.controller'
import { AdsLibraryRepository } from './ads-library.repository'
import { AdsLibraryService } from './ads-library.service'

@Module({
  imports: [PrismaModule],
  controllers: [AdsLibraryController],
  providers: [AdsLibraryService, AdsLibraryRepository],
})
export class AdsLibraryModule {}
