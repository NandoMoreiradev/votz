import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { OrgPermission } from '@prisma/client'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { OrgPermissionGuard, RequireOrgPermission } from '../../org-memberships/org-memberships.guard'
import { AdsReachService } from './ads-reach.service'
import { AdReachEstimateDto } from './dto/ads-reach.dto'

@ApiTags('ads')
@Controller('ads/:orgType/:orgId')
@UseGuards(JwtAuthGuard, OrgPermissionGuard)
@ApiBearerAuth()
export class AdsReachController {
  constructor(private readonly service: AdsReachService) {}

  @Post('reach-estimate')
  @HttpCode(HttpStatus.OK)
  @RequireOrgPermission(OrgPermission.MANAGE_ADS)
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 40, ttl: 60_000 }, long: { limit: 600, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Estimativa de alcance do público (faixa, nunca o número exato)' })
  estimate(@Param('orgType') orgType: string, @Param('orgId', ParseUUIDPipe) _orgId: string, @Body() dto: AdReachEstimateDto) {
    if (orgType !== 'COMPANY') throw new BadRequestException('Só empresas podem anunciar no Votz.')
    return this.service.estimate(dto)
  }
}
