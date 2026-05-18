import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ImprensaService } from './imprensa.service'

@ApiTags('imprensa')
@Controller('imprensa')
export class ImprensaController {
  constructor(private readonly service: ImprensaService) {}

  @Get('resumo')
  @ApiOperation({ summary: 'Snapshot geral da plataforma para imprensa' })
  resumo() {
    return this.service.getResumo()
  }

  @Get('tendencias')
  @ApiOperation({ summary: 'Tendências por categoria e cidade (últimos N dias)' })
  tendencias(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.service.getTendencias(days)
  }

  @Get('relatos-destaque')
  @ApiOperation({ summary: 'Relatos com maior pressão (não-anônimos)' })
  relatosDestaque(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getRelatosDestaque(limit)
  }

  @Get('entidades-ranking')
  @ApiOperation({ summary: 'Entidades com mais relatos direcionados (últimos 90 dias)' })
  entidadesRanking(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getEntidadesRanking(limit)
  }

  @Get('surtos-ativos')
  @ApiOperation({ summary: 'Surtos ativos ordenados por volume' })
  surtosAtivos() {
    return this.service.getSurtosAtivos()
  }
}
