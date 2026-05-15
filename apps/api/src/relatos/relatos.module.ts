import { Module } from '@nestjs/common'
import { RelatosController } from './relatos.controller'
import { RelatosService } from './relatos.service'
import { RelatosRepository } from './relatos.repository'
import { TimelineModule } from '../timeline/timeline.module'

@Module({
  imports: [TimelineModule],
  controllers: [RelatosController],
  providers: [RelatosService, RelatosRepository],
  exports: [RelatosService],
})
export class RelatosModule {}
