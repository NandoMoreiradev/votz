import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { AdsExperimentsRepository } from './ads-experiments.repository'
import { AdsExperimentsService } from './ads-experiments.service'

/** Relatório dos testes A/B e do modo sombra da entrega. Hoje só o comando `ads:experiment-report` usa. */
@Module({
  imports: [PrismaModule],
  providers: [AdsExperimentsService, AdsExperimentsRepository],
  exports: [AdsExperimentsService],
})
export class AdsExperimentsModule {}
