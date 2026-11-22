import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { FlagStatus } from '@prisma/client'
import { UserType } from '@votz/shared-types'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { CreateFlagDto } from './dto/create-flag.dto'
import { ListFlagsQueryDto } from './dto/list-flags-query.dto'
import { ResolveFlagDto } from './dto/resolve-flag.dto'
import { AdReviewDecisionDto, AdReviewQueryDto } from '../ads/ads-review/dto/ads-review.dto'
import { AdsReviewService } from '../ads/ads-review/ads-review.service'
import { AdsFraudService } from '../ads/ads-fraud/ads-fraud.service'
import { AdFraudQueryDto, AdFraudResolveDto } from '../ads/ads-fraud/dto/ads-fraud.dto'
import { ModerationService } from './moderation.service'

@ApiTags('moderation')
@Controller('moderation')
export class ModerationController {
  constructor(private readonly service: ModerationService) {}

  @Post('flags')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({
    short: { limit: 5, ttl: 60_000 },
    medium: { limit: 10, ttl: 600_000 },
    long: { limit: 20, ttl: 3_600_000 },
  })
  @ApiOperation({ summary: 'Sinalizar relato ou comentário para revisão da moderação' })
  @ApiResponse({ status: 201, description: 'Sinalização registrada.' })
  @ApiResponse({ status: 403, description: 'E-mail não verificado ou tentativa de sinalizar o próprio conteúdo.' })
  @ApiResponse({ status: 404, description: 'Conteúdo não encontrado.' })
  @ApiResponse({ status: 409, description: 'Usuário já sinalizou este conteúdo.' })
  createFlag(
    @CurrentUser() user: { id: string; emailVerified: boolean },
    @Body() dto: CreateFlagDto,
  ) {
    return this.service.createFlag(user, dto)
  }
}

@ApiTags('admin')
@Controller('admin/flags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.MODERATOR, UserType.ADMIN)
@ApiBearerAuth()
export class AdminFlagsController {
  constructor(private readonly service: ModerationService) {}

  @Get()
  @ApiOperation({ summary: 'Listar sinalizações de conteúdo com prévia do alvo' })
  listFlags(@Query() query: ListFlagsQueryDto) {
    return this.service.listFlags(query.status ?? FlagStatus.OPEN, query.page ?? 1, query.limit ?? 20)
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolver sinalização (descartar ou remover conteúdo)' })
  resolveFlag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveFlagDto,
    @CurrentUser() actor: { id: string; type: string },
  ) {
    return this.service.resolveFlag(id, actor, dto)
  }
}

/**
 * Fila de revisão de anúncios (plano de anúncios, seção 5). Mesma equipe da moderação: moderador ou admin.
 * Cada decisão fica gravada em `ad_reviews`, com quem decidiu, o motivo e o texto do anúncio naquele momento.
 */
@ApiTags('admin')
@Controller('admin/ad-reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.MODERATOR, UserType.ADMIN)
@ApiBearerAuth()
export class AdminAdReviewsController {
  constructor(private readonly adsReview: AdsReviewService) {}

  @Get()
  @ApiOperation({ summary: 'Fila de revisão de anúncios (mais antigos primeiro)' })
  list(@Query() query: AdReviewQueryDto) {
    return this.adsReview.listQueue(query.status, query.page, query.limit)
  }

  @Post(':adId/decision')
  @ApiOperation({ summary: 'Aprovar ou recusar um anúncio (recusar exige o motivo)' })
  decide(
    @Param('adId', ParseUUIDPipe) adId: string,
    @Body() dto: AdReviewDecisionDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.adsReview.decide(adId, actor, dto)
  }
}

/**
 * Tráfego suspeito nos anúncios (antifraude). O anúncio com cliques fora do normal já teve o clique inválido devolvido
 * ao anunciante; aqui a moderação confirma que era inválido ou descarta (e o anúncio pausado pelo caso volta).
 */
@ApiTags('admin')
@Controller('admin/ad-fraud-flags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.MODERATOR, UserType.ADMIN)
@ApiBearerAuth()
export class AdminAdFraudController {
  constructor(private readonly adsFraud: AdsFraudService) {}

  @Get()
  @ApiOperation({ summary: 'Casos de tráfego suspeito em anúncios (extremos e mais antigos primeiro)' })
  list(@Query() query: AdFraudQueryDto) {
    return this.adsFraud.listQueue(query.status, query.page, query.limit)
  }

  @Post(':flagId/resolve')
  @ApiOperation({ summary: 'Confirmar que o tráfego era inválido ou descartar o caso' })
  resolve(
    @Param('flagId', ParseUUIDPipe) flagId: string,
    @Body() dto: AdFraudResolveDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.adsFraud.resolve(flagId, actor, dto)
  }
}
