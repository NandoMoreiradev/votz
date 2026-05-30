import { Module } from '@nestjs/common'
import { PropostasController } from './propostas.controller'
import { PropostasService } from './propostas.service'
import { PropostasRepository } from './propostas.repository'

@Module({
  controllers: [PropostasController],
  providers: [PropostasService, PropostasRepository],
  exports: [PropostasService],
})
export class PropostasModule {}
