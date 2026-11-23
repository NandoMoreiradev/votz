import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common'
import { IsIn, IsOptional } from 'class-validator'
import { UserType } from '@votz/shared-types'
import { Roles } from '../../auth/decorators/roles.decorator'
import { RolesGuard } from '../../auth/guards/roles.guard'
import { AdsAutoTopUpService } from './ads-auto-topup.service'
import { AdsRefundsService } from './ads-refunds.service'
import { SetAdAutoTopUpDto } from './dto/ads-auto-topup.dto'
import { RequestAdRefundDto, ResolveAdRefundDto } from './dto/ads-refunds.dto'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { OrgPermission } from '@prisma/client'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../auth/decorators/current-user.decorator'
import { OrgPermissionGuard, RequireOrgPermission } from '../../org-memberships/org-memberships.guard'
import { AdsBillingService } from './ads-billing.service'
import { CreateAdTopUpDto } from './dto/ads-billing.dto'

/** Faturamento da conta de anúncios (saldo, recarga, extrato). Só perfis de empresa; o serviço confere a conta. */
@ApiTags('ads')
@Controller('ads/:orgType/:orgId')
@UseGuards(JwtAuthGuard, OrgPermissionGuard)
@ApiBearerAuth()
export class AdsBillingController {
  constructor(
    private readonly service: AdsBillingService,
    private readonly refunds: AdsRefundsService,
    private readonly autoTopUp: AdsAutoTopUpService,
  ) {}

  @Get('accounts/:accountId/billing')
  @RequireOrgPermission(OrgPermission.VIEW_ADS)
  @ApiOperation({ summary: 'Saldo, recargas recentes e extrato da conta de anúncios' })
  billing(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    onlyCompany(orgType)
    return this.service.getBilling(orgId, accountId)
  }

  @Post('accounts/:accountId/topups')
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @Throttle({ short: { limit: 5, ttl: 60_000 }, medium: { limit: 20, ttl: 600_000 } })
  @ApiOperation({ summary: 'Pede uma recarga de saldo (Pix, boleto ou cartão)' })
  createTopUp(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAdTopUpDto,
  ) {
    onlyCompany(orgType)
    return this.service.createTopUp(orgId, accountId, user.id, dto)
  }

  @Post('topups/:topUpId/confirm-test')
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @ApiOperation({ summary: 'Só no modo de teste: finge que a recarga foi paga' })
  confirmTest(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('topUpId', ParseUUIDPipe) topUpId: string,
  ) {
    onlyCompany(orgType)
    return this.service.confirmTestTopUp(orgId, topUpId)
  }

  @Post('accounts/:accountId/refunds')
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @Throttle({ short: { limit: 3, ttl: 60_000 }, medium: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Pede de volta o saldo que sobrou (só o que foi pago em recargas)' })
  requestRefund(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RequestAdRefundDto,
  ) {
    onlyCompany(orgType)
    return this.refunds.request(orgId, accountId, user.id, dto)
  }

  @Post('refunds/:refundId/cancel')
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @ApiOperation({ summary: 'Cancela um pedido de devolução que ainda não foi pago: o valor volta ao saldo' })
  cancelRefund(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('refundId', ParseUUIDPipe) refundId: string,
    @CurrentUser() user: { id: string },
  ) {
    onlyCompany(orgType)
    return this.refunds.cancel(orgId, refundId, user.id)
  }

  @Put('accounts/:accountId/auto-topup')
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @Throttle({ short: { limit: 3, ttl: 60_000 }, medium: { limit: 20, ttl: 600_000 } })
  @ApiOperation({ summary: 'Liga, muda ou desliga a recarga automática (exige aceite para ligar)' })
  setAutoTopUp(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SetAdAutoTopUpDto,
  ) {
    onlyCompany(orgType)
    return this.autoTopUp.set(orgId, accountId, user.id, dto)
  }

  @Post('topups/:topUpId/cancel')
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @ApiOperation({ summary: 'Cancela uma recarga que ainda espera pagamento' })
  cancel(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('topUpId', ParseUUIDPipe) topUpId: string,
  ) {
    onlyCompany(orgType)
    return this.service.cancelTopUp(orgId, topUpId)
  }
}

function onlyCompany(orgType: string) {
  if (orgType !== 'COMPANY') throw new BadRequestException('Só empresas podem anunciar no Votz.')
}

class RefundQueueQueryDto {
  @IsOptional()
  @IsIn(['REQUESTED', 'PAID', 'REJECTED', 'CANCELED'])
  status?: 'REQUESTED' | 'PAID' | 'REJECTED' | 'CANCELED'
}

/**
 * Fila de devoluções de saldo. Só admin: é dinheiro saindo do Votz. A pessoa devolve o dinheiro por fora (Pix ou
 * transferência para a conta do anunciante) e marca como devolvido aqui, ou recusa com o motivo (o valor volta ao saldo).
 */
@ApiTags('admin')
@Controller('admin/ad-refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.ADMIN)
@ApiBearerAuth()
export class AdminAdRefundsController {
  constructor(private readonly refunds: AdsRefundsService) {}

  @Get()
  @ApiOperation({ summary: 'Fila de pedidos de devolução de saldo (mais antigos primeiro)' })
  list(@Query() query: RefundQueueQueryDto) {
    return this.refunds.queue(query.status)
  }

  @Post(':refundId/resolve')
  @ApiOperation({ summary: 'Marca como devolvido ou recusa (recusar exige o motivo)' })
  resolve(@Param('refundId', ParseUUIDPipe) refundId: string, @Body() dto: ResolveAdRefundDto, @CurrentUser() actor: { id: string }) {
    return this.refunds.resolve(refundId, actor.id, dto)
  }
}
