import { Controller, Get, Query, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Response } from 'express'
import { Public } from '../../auth/decorators/public.decorator'
import { AdsLibraryService } from './ads-library.service'
import { AdLibraryQueryDto } from './dto/ads-library.dto'

/** Biblioteca pública de anúncios (`/anuncios/biblioteca` no site). Aberta a qualquer pessoa, sem login. */
@ApiTags('ads')
@Controller('ads')
export class AdsLibraryController {
  constructor(private readonly service: AdsLibraryService) {}

  @Public()
  @Get('library')
  @Throttle({ short: { limit: 10, ttl: 1_000 }, medium: { limit: 120, ttl: 60_000 }, long: { limit: 3_000, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Biblioteca pública de anúncios: quem pagou, texto, período, regiões e faixas de gasto e exibições' })
  async list(@Query() query: AdLibraryQueryDto, @Res({ passthrough: true }) res: Response) {
    // Muda devagar e é igual para todo mundo: um minuto de cache alivia o banco.
    res.setHeader('Cache-Control', 'public, max-age=60')
    return this.service.list(query)
  }
}
