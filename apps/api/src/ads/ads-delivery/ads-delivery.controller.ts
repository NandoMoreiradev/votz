import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgPermission } from '@prisma/client'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../auth/decorators/current-user.decorator'
import { OrgPermissionGuard, RequireOrgPermission } from '../../org-memberships/org-memberships.guard'
import { AdsDeliveryService } from './ads-delivery.service'
import { AdEventsBatchDto, AdStatsQueryDto, NextAdQueryDto } from './dto/ads-delivery.dto'

/** O que o site e o celular chamam para mostrar anúncios e contar o que aconteceu. Quem é a pessoa vem só da sessão. */
@ApiTags('ads')
@Controller('ads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdsDeliveryController {
  constructor(private readonly service: AdsDeliveryService) {}

  @Get('next')
  @ApiOperation({ summary: 'Anúncio da vez para o espaço patrocinado do feed (ou nenhum)' })
  async next(@CurrentUser() user: { id: string }, @Query() query: NextAdQueryDto) {
    // Em desenvolvimento a resposta sem anúncio explica o motivo (`debugReason`). Em produção o campo nunca existe.
    const { ad, reason } = await this.service.nextWithReason(user.id, query)
    return reason ? { ad, debugReason: reason } : { ad }
  }

  @Post('events')
  @HttpCode(200)
  @ApiOperation({ summary: 'Eventos de anúncio em lote: visível, clique, esconder' })
  events(@CurrentUser() user: { id: string }, @Body() dto: AdEventsBatchDto) {
    return this.service.ingest(user.id, dto)
  }
}

/** Relatório do anunciante. */
@ApiTags('ads')
@Controller('ads/:orgType/:orgId')
@UseGuards(JwtAuthGuard, OrgPermissionGuard)
@ApiBearerAuth()
export class AdsStatsController {
  constructor(private readonly service: AdsDeliveryService) {}

  @Get('accounts/:accountId/stats')
  @RequireOrgPermission(OrgPermission.VIEW_ADS)
  @ApiOperation({ summary: 'Exibições, cliques e gasto por dia da conta de anúncios' })
  stats(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() query: AdStatsQueryDto,
  ) {
    if (orgType !== 'COMPANY') throw new BadRequestException('Só empresas podem anunciar no Votz.')
    return this.service.stats(orgId, accountId, query.days)
  }

  @Get('accounts/:accountId/stats/by-ad')
  @RequireOrgPermission(OrgPermission.VIEW_ADS)
  @ApiOperation({ summary: 'Exibições, cliques e gasto de cada anúncio da conta no período (para a tabela de campanhas)' })
  statsByAd(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() query: AdStatsQueryDto,
  ) {
    if (orgType !== 'COMPANY') throw new BadRequestException('Só empresas podem anunciar no Votz.')
    return this.service.statsByAd(orgId, accountId, query.days)
  }
}
