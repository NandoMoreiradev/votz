import { Module } from '@nestjs/common'
import { SuggestionsController } from './suggestions.controller'
import { SuggestionsRepository } from './suggestions.repository'
import { SuggestionsService } from './suggestions.service'

@Module({
  controllers: [SuggestionsController],
  providers: [SuggestionsService, SuggestionsRepository],
  exports: [SuggestionsService],
})
export class SuggestionsModule {}
