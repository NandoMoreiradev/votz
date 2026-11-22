import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
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
  constructor(private readonly service: AdsBillingService) {}

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
