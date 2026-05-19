import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe, StreamableFile, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { ImprensaService } from './imprensa.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

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

  @Get('export/csv')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 2, ttl: 10_000 }, medium: { limit: 10, ttl: 3_600_000 }, long: { limit: 20, ttl: 86_400_000 } })
  @ApiOperation({ summary: '[PRESS] Export filtered reports as CSV' })
  async exportCsv(
    @CurrentUser() user: { id: string },
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('state') state?: string,
    @Query('city') city?: string,
    @Query('category') category?: string,
  ): Promise<StreamableFile> {
    const { filename, csv } = await this.service.exportCsv(user.id, days, state, city, category)
    const buffer = Buffer.from(csv, 'utf-8')
    return new StreamableFile(buffer, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    })
  }
}
