import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiSecurity,
  ApiHeader,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { PublicApiService } from './public-api.service'
import { ApiKeyGuard } from './guards/api-key.guard'
import { ListPublicReportsDto } from './dto/list-public-reports.dto'
import { ListPublicSurtosDto } from './dto/list-public-surtos.dto'
import { ListPublicEntitiesDto } from './dto/list-public-entities.dto'

@ApiTags('api-publica')
@ApiSecurity('x-api-key')
@ApiHeader({ name: 'x-api-key', description: 'Sua API key (gerada em POST /api-keys)', required: true })
@ApiUnauthorizedResponse({ description: 'API key ausente ou inválida' })
@ApiTooManyRequestsResponse({ description: 'Limite de 1.000 req/h excedido (FREE) ou 10.000 req/h (PAID)' })
@Controller('api-publica')
@UseGuards(ApiKeyGuard)
@SkipThrottle()
export class PublicApiController {
  constructor(private readonly service: PublicApiService) {}

  // ── Relatos ──────────────────────────────────────────────────────────────────

  @Get('relatos')
  @ApiOperation({
    summary: 'Listar relatos',
    description: 'Retorna lista paginada de relatos públicos com filtros opcionais. Relatos anônimos não expõem o autor.',
  })
  @ApiOkResponse({ description: 'Lista paginada de relatos' })
  findReports(@Query() query: ListPublicReportsDto) {
    return this.service.findReports(query)
  }

  @Get('relatos/:id')
  @ApiOperation({ summary: 'Detalhe de um relato', description: 'Retorna o relato completo com timeline de eventos.' })
  @ApiParam({ name: 'id', description: 'UUID do relato' })
  @ApiOkResponse({ description: 'Relato encontrado' })
  @ApiNotFoundResponse({ description: 'Relato não encontrado' })
  findReportById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findReportById(id)
  }

  // ── Surtos ───────────────────────────────────────────────────────────────────

  @Get('surtos')
  @ApiOperation({
    summary: 'Listar surtos',
    description: 'Retorna surtos (alertas de problema em escala). Por padrão retorna apenas os ativos.',
  })
  @ApiOkResponse({ description: 'Lista de surtos' })
  findSurtos(@Query() query: ListPublicSurtosDto) {
    return this.service.findSurtos(query)
  }

  // ── Tendências ───────────────────────────────────────────────────────────────

  @Get('tendencias')
  @ApiOperation({
    summary: 'Tendências por categoria',
    description: 'Distribuição de relatos por categoria e cidades com mais registros no período.',
  })
  @ApiQuery({ name: 'days', enum: [7, 30, 90, 365], required: false, description: 'Período em dias (padrão: 30)' })
  @ApiOkResponse({ description: 'Tendências do período' })
  getTendencias(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.service.getTendencias(days)
  }

  // ── Entidades ─────────────────────────────────────────────────────────────────

  @Get('entidades')
  @ApiOperation({
    summary: 'Listar entidades públicas',
    description: 'Prefeituras, hospitais, concessões e demais órgãos cadastrados na plataforma.',
  })
  @ApiOkResponse({ description: 'Lista paginada de entidades' })
  findEntities(@Query() query: ListPublicEntitiesDto) {
    return this.service.findEntities(query)
  }

  @Get('entidades/:id')
  @ApiOperation({ summary: 'Detalhe de entidade com estatísticas de relatos' })
  @ApiParam({ name: 'id', description: 'UUID da entidade' })
  @ApiOkResponse({ description: 'Entidade com stats de resolução' })
  @ApiNotFoundResponse({ description: 'Entidade não encontrada' })
  findEntityById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findEntityById(id)
  }
}
