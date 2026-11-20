import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgPermission, OrgType } from '@prisma/client'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Public } from '../auth/decorators/public.decorator'
import { OrgPermissionGuard, RequireOrgPermission } from '../org-memberships/org-memberships.guard'
import { HandlesService } from './handles.service'
import { SetOrgHandleDto } from './dto/set-org-handle.dto'

@ApiTags('handles')
@Controller('handles')
export class HandlesController {
  constructor(private readonly service: HandlesService) {}

  @Public()
  @ApiOperation({ summary: 'Descobrir de quem é um @nome (cidadão ou página)' })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':username')
  resolve(@Param('username') username: string) {
    return this.service.resolve(username)
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Definir o @nome da página (político, entidade ou empresa)' })
  @UseGuards(JwtAuthGuard, OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.MANAGE_PROFILE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch(':orgType/:orgId')
  setForOrg(
    @Param('orgType', new ParseEnumPipe(OrgType)) orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: SetOrgHandleDto,
  ) {
    return this.service.setForOrg(orgType, orgId, dto.username)
  }
}
