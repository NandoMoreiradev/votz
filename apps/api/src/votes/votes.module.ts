import { Module } from '@nestjs/common'
import { VotesController } from './votes.controller'
import { VotesService } from './votes.service'
import { VotesRepository } from './votes.repository'
import { PressModule } from '../press/press.module'

@Module({
  imports: [PressModule],
  controllers: [VotesController],
  providers: [VotesService, VotesRepository],
})
export class VotesModule {}
