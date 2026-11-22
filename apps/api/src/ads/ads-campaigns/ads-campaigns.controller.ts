import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgPermission } from '@prisma/client'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../auth/decorators/current-user.decorator'
import { OrgPermissionGuard, RequireOrgPermission } from '../../org-memberships/org-memberships.guard'
import { AdsCampaignsService } from './ads-campaigns.service'
import { CreateAdAccountDto, CreateAdCampaignDto, SetAdCampaignStatusDto } from './dto/ads-campaigns.dto'

/**
 * Gerenciador de anúncios do Estúdio. Só perfis de empresa (`orgType` = COMPANY). O guard confere se a pessoa é
 * membro ativo da empresa e tem a permissão; o serviço confere se a conta e a campanha são mesmo da empresa.
 */
@ApiTags('ads')
@Controller('ads/:orgType/:orgId')
@UseGuards(JwtAuthGuard, OrgPermissionGuard)
@ApiBearerAuth()
export class AdsCampaignsController {
  constructor(private readonly service: AdsCampaignsService) {}

  @Get('accounts')
  @RequireOrgPermission(OrgPermission.VIEW_ADS)
  @ApiOperation({ summary: 'Contas de anúncios da empresa' })
  listAccounts(@Param('orgType') orgType: string, @Param('orgId', ParseUUIDPipe) orgId: string) {
    onlyCompany(orgType)
    return this.service.listAccounts(orgId)
  }

  @Post('accounts')
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @ApiOperation({ summary: 'Cria conta de anúncios (só empresa verificada)' })
  createAccount(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAdAccountDto,
  ) {
    onlyCompany(orgType)
    return this.service.createAccount(orgId, user.id, dto.name)
  }

  @Get('accounts/:accountId/campaigns')
  @RequireOrgPermission(OrgPermission.VIEW_ADS)
  @ApiOperation({ summary: 'Campanhas da conta, com conjuntos e anúncios (três níveis)' })
  listCampaigns(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    onlyCompany(orgType)
    return this.service.listCampaigns(orgId, accountId)
  }

  @Post('accounts/:accountId/campaigns')
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @ApiOperation({ summary: 'Cria campanha, conjunto, criativo e anúncio como rascunho (passo a passo do Estúdio)' })
  createCampaign(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: CreateAdCampaignDto,
  ) {
    onlyCompany(orgType)
    return this.service.createCampaign(orgId, accountId, dto)
  }

  @Patch('campaigns/:campaignId/status')
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @ApiOperation({ summary: 'Liga, pausa ou arquiva a campanha. Ligar exige anúncio aprovado e saldo.' })
  setStatus(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: SetAdCampaignStatusDto,
  ) {
    onlyCompany(orgType)
    return this.service.setCampaignStatus(orgId, campaignId, dto)
  }

  @Post('ads/:adId/submit')
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @ApiOperation({ summary: 'Manda o anúncio para revisão' })
  submitAd(
    @Param('orgType') orgType: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('adId', ParseUUIDPipe) adId: string,
  ) {
    onlyCompany(orgType)
    return this.service.submitAd(orgId, adId)
  }
}

function onlyCompany(orgType: string) {
  if (orgType !== 'COMPANY') throw new BadRequestException('Só empresas podem anunciar no Votz.')
}
