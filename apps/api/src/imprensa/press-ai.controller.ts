import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { PressBriefingService } from './press-briefing.service'
import { PressSearchService } from './press-search.service'

/** Ferramentas de imprensa com IA: busca por significado e briefing de surto. */
@ApiTags('imprensa')
@ApiBearerAuth()
@Controller('imprensa')
export class PressAiController {
  constructor(
    private readonly search: PressSearchService,
    private readonly briefing: PressBriefingService,
  ) {}

  @Get('busca')
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 3, ttl: 10_000 }, medium: { limit: 60, ttl: 3_600_000 }, long: { limit: 300, ttl: 86_400_000 } })
  @ApiOperation({ summary: '[PRESS] Busca por significado nos relatos públicos (ex.: "falta de remédio no posto")' })
  find(
    @CurrentUser() user: { id: string },
    @Query('q') q = '',
    @Query('days') days?: string,
    @Query('state') state?: string,
    @Query('city') city?: string,
    @Query('category') category?: string,
  ) {
    const parsedDays = days === undefined || days === '' ? undefined : Number(days)
    if (parsedDays !== undefined && !Number.isFinite(parsedDays)) throw new BadRequestException('Período inválido.')
    return this.search.search(user.id, { q, days: parsedDays, state, city, category })
  }

  @Get('surtos/:id/briefing')
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 2, ttl: 10_000 }, medium: { limit: 20, ttl: 3_600_000 }, long: { limit: 100, ttl: 86_400_000 } })
  @ApiOperation({ summary: '[PRESS Pro] Briefing do surto: números do banco e texto escrito por IA (gerado uma vez por surto)' })
  surtoBriefing(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) throw new BadRequestException('Surto inválido.')
    return this.briefing.get(user.id, id)
  }
}
