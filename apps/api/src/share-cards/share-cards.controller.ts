import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgPermission, ShareCardFormat } from '@prisma/client'
import { Throttle } from '@nestjs/throttler'
import { Response } from 'express'
import { ActingUser } from '../auth/acting-org'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator'
import { PlanGuard } from '../auth/guards/plan.guard'
import { GenerateShareCardDto, ShareCardQueryDto } from './dto/share-card.dto'
import { ShareCardsService } from './share-cards.service'

@ApiTags('share-cards')
@Controller('share-cards')
@UseGuards(PlanGuard)
export class ShareCardsController {
  constructor(private readonly shareCards: ShareCardsService) {}

  @Public()
  @Get('public/:slugOrId/meta')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Dados públicos verificáveis do mandato para página /p/:slug/mandato' })
  getPublicMeta(
    @Param('slugOrId') slugOrId: string,
    @Query() query: ShareCardQueryDto,
  ) {
    return this.shareCards.getPublicMeta(slugOrId, query.from, query.to)
  }

  @Public()
  @Get('public/:slugOrId/image')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Imagem PNG gerada no servidor (1080x1350 Feed ou 1080x1920 Stories)' })
  async getPublicImage(
    @Param('slugOrId') slugOrId: string,
    @Query() query: ShareCardQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.shareCards.renderOrFetchPublicImage(
      slugOrId,
      query.format ?? ShareCardFormat.FEED,
      query.from,
      query.to,
    )
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(buffer)
  }

  @Public()
  @Get('public/:slugOrId/og')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Meta tags Open Graph para compartilhamento da página pública do mandato' })
  getPublicOg(
    @Param('slugOrId') slugOrId: string,
    @Query() query: ShareCardQueryDto,
  ) {
    return this.shareCards.renderOgHtml(
      slugOrId,
      query.format ?? ShareCardFormat.FEED,
      query.from,
      query.to,
    )
  }

  @Get()
  @ApiBearerAuth()
  @RequiresFeature('share_card', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Listar cartões compartilháveis recentes e cota mensal do mandato' })
  list(@CurrentUser() user: ActingUser) {
    return this.shareCards.listCards(user)
  }

  @Post('generate')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @RequiresFeature('share_card', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Gerar ou obter do cache cartão PNG factual (Feed ou Stories)' })
  generate(@CurrentUser() user: ActingUser, @Body() dto: GenerateShareCardDto) {
    return this.shareCards.generateCard(user, dto)
  }
}
