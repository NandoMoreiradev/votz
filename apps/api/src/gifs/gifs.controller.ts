import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { GifsService } from './gifs.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@ApiTags('gifs')
@Controller('gifs')
export class GifsController {
  constructor(private readonly gifsService: GifsService) {}

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Buscar GIFs (KLIPY ou GIPHY via proxy seguro com cache)' })
  @ApiQuery({ name: 'q', required: false, description: 'Termo de busca (vazio retorna em alta)' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'pos', required: false })
  search(
    @Query('q') q = '',
    @Query('limit') limit = '20',
    @Query('pos') pos?: string,
  ) {
    return this.gifsService.search(q, Number(limit) || 20, pos)
  }
}
