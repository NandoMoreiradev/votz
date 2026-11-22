import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, UseGuards, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { OrgPermission } from '@prisma/client'
import type { Response } from 'express'
import type { AdConversionEvent } from '@votz/shared-types'
import { Public } from '../../auth/decorators/public.decorator'
import { CurrentUser } from '../../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { OrgPermissionGuard, RequireOrgPermission } from '../../org-memberships/org-memberships.guard'
import { AdsConversionsService, type ConversionKeyIdentity } from './ads-conversions.service'
import { ConversionKeyGuard, CurrentConversionKey } from './conversion-key.guard'
import { AdConversionsBatchDto, CreateConversionKeyDto } from './dto/ads-conversions.dto'

/**
 * O botão do anúncio abre este endereço (`votz.app/c/<id>`, que o site e o celular chegam aqui). Ele leva para a
 * página do anunciante com o `votz_click_id` no link. Aberto a qualquer pessoa, sem login: quem clica já saiu do Votz.
 */
@ApiTags('ads')
@Controller('ads')
export class AdsClickController {
  constructor(
    private readonly service: AdsConversionsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('c/:token')
  @Throttle({ short: { limit: 20, ttl: 1_000 }, medium: { limit: 300, ttl: 60_000 }, long: { limit: 5_000, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Clique no anúncio: leva à página do anunciante com o votz_click_id no link' })
  async click(@Param('token') token: string, @Res() res: Response) {
    const target = await this.service.resolveClick(token)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    // Endereço que não existe (digitado errado, antigo): volta para o site em vez de mostrar erro.
    res.redirect(302, target ?? String(this.config.get('APP_URL', 'http://localhost:5173')))
  }
}

/** API de conversões: o anunciante conta o que o clique virou. Só leva o identificador do clique, nada da pessoa. */
@ApiTags('ads')
@Controller('ads')
export class AdsConversionsController {
  constructor(private readonly service: AdsConversionsService) {}

  @Public()
  @Post('conversions')
  @HttpCode(200)
  @UseGuards(ConversionKeyGuard)
  @Throttle({ short: { limit: 10, ttl: 1_000 }, medium: { limit: 300, ttl: 60_000 }, long: { limit: 10_000, ttl: 3_600_000 } })
  @ApiHeader({ name: 'x-api-key', description: 'Chave de conversões (Estúdio → Anúncios → Conversões)', required: true })
  @ApiOperation({ summary: 'Contar conversões de cliques de anúncios (até 100 por chamada; repetir não conta de novo)' })
  ingest(@CurrentConversionKey() key: ConversionKeyIdentity, @Body() dto: AdConversionsBatchDto) {
    return this.service.ingest(key, dto.events as AdConversionEvent[])
  }
}

/** Chaves de conversões, no Estúdio da empresa. */
@ApiTags('ads')
@Controller('ads/:orgType/:orgId/accounts/:accountId/conversion-keys')
@UseGuards(JwtAuthGuard, OrgPermissionGuard)
@ApiBearerAuth()
export class AdsConversionKeysController {
  constructor(private readonly service: AdsConversionsService) {}

  @Get()
  @RequireOrgPermission(OrgPermission.VIEW_ADS)
  @ApiOperation({ summary: 'Chaves de conversões da conta (sem o segredo)' })
  list(@Param('orgType') orgType: string, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('accountId', ParseUUIDPipe) accountId: string) {
    this.requireCompany(orgType)
    return this.service.listKeys(orgId, accountId)
  }

  @Post()
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @Throttle({ short: { limit: 2, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 50, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Criar chave de conversões. O segredo aparece só nesta resposta.' })
  create(
    @CurrentUser() user: { id: string },
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: CreateConversionKeyDto,
  ) {
    this.requireCompany(orgType)
    return this.service.createKey(orgId, accountId, user.id, dto.name)
  }

  @Post(':keyId/revoke')
  @HttpCode(200)
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @ApiOperation({ summary: 'Revogar chave de conversões (não volta)' })
  revoke(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    this.requireCompany(orgType)
    return this.service.revokeKey(orgId, accountId, keyId)
  }

  private requireCompany(orgType: string) {
    if (orgType !== 'COMPANY') throw new BadRequestException('Só empresas podem anunciar no Votz.')
  }
}
