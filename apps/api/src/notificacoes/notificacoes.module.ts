import { Module } from '@nestjs/common'
import { NotificacoesController } from './notificacoes.controller'
import { NotificacoesService } from './notificacoes.service'
import { NotificacoesRepository } from './notificacoes.repository'

@Module({
  controllers: [NotificacoesController],
  providers: [NotificacoesService, NotificacoesRepository],
  exports: [NotificacoesService],
})
export class NotificacoesModule {}
