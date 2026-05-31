import { Module } from '@nestjs/common'
import { SubscricoesController } from './subscricoes.controller'
import { SubscricoesService } from './subscricoes.service'

@Module({
  controllers: [SubscricoesController],
  providers: [SubscricoesService],
})
export class SubscricoesModule {}
