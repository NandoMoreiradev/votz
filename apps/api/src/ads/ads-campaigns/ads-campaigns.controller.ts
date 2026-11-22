import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { OrgPermission } from '@prisma/client'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../auth/decorators/current-user.decorator'
import { MEDIA_VIDEO_MAX_BYTES, PresignMediaUploadDto } from '../../media/dto/media.dto'
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
    @CurrentUser() user: { id: string },
  ) {
    onlyCompany(orgType)
    return this.service.createCampaign(orgId, accountId, dto, user.id)
  }

  // ─── Foto e vídeo do anúncio ─────────────────────────────────────────────────────────────────────
  // Mesmo envio das publicações (o original fica privado e sem metadados; o formato e o enquadramento vão ao criar a
  // campanha), mas só quem gerencia anúncios da empresa envia, e valem as exigências de anúncio.

  @Post('media')
  @HttpCode(HttpStatus.CREATED)
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 20, ttl: 60_000 }, long: { limit: 120, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_VIDEO_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Envia a foto ou o vídeo do anúncio (mínimo 1080 px de largura; vídeo até 60 s; sem GIF)' })
  uploadMedia(
    @Param('orgType') orgType: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    onlyCompany(orgType)
    if (!file) throw new BadRequestException('Nenhum arquivo enviado')
    return this.service.uploadMedia(user.id, file.buffer)
  }

  @Post('media/presign')
  @HttpCode(HttpStatus.CREATED)
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 40, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Pede o endereço para enviar o vídeo do anúncio direto ao armazenamento (PUT). Depois, confirme em media/:id/complete.' })
  presignMedia(@Param('orgType') orgType: string, @Body() dto: PresignMediaUploadDto, @CurrentUser() user: { id: string }) {
    onlyCompany(orgType)
    return this.service.presignMedia(user.id, dto)
  }

  @Post('media/:mediaId/complete')
  @HttpCode(HttpStatus.OK)
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 20, ttl: 60_000 }, long: { limit: 60, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Confirma o envio direto: confere tamanho, tipo, largura e duração do vídeo do anúncio' })
  completeMedia(
    @Param('orgType') orgType: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() user: { id: string },
  ) {
    onlyCompany(orgType)
    return this.service.completeMedia(user.id, mediaId)
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
