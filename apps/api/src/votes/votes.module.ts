import { Module } from '@nestjs/common'
import { VotesController } from './votes.controller'
import { VotesService } from './votes.service'
import { VotesRepository } from './votes.repository'

@Module({
  controllers: [VotesController],
  providers: [VotesService, VotesRepository],
})
export class VotesModule {}
