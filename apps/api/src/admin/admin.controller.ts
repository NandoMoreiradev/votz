import {
  Controller, Get, Delete, Patch, Param, Query, Body,
  UseGuards, ParseIntPipe, DefaultValuePipe, ParseBoolPipe,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { UserType } from '@votz/shared-types'
import { AdminService } from './admin.service'

class SetBanDto {
  banned: boolean
}

class SetTypeDto {
  @IsEnum(UserType)
  type: UserType
}

class SetVerifiedDto {
  verified: boolean
}

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.MODERATOR, UserType.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Platform overview stats' })
  stats() { return this.service.stats() }

  // ── Users ────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List users' })
  listUsers(
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.service.listUsers(search, page, limit)
  }

  @Patch('users/:id/ban')
  @ApiOperation({ summary: 'Ban or unban a user' })
  banUser(@Param('id') id: string, @Body() dto: SetBanDto) {
    return this.service.banUser(id, dto.banned)
  }

  @Patch('users/:id/type')
  @ApiOperation({ summary: 'Change user type' })
  setUserType(@Param('id') id: string, @Body() dto: SetTypeDto) {
    return this.service.setUserType(id, dto.type)
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  @Get('reports')
  @ApiOperation({ summary: 'List reports' })
  listReports(
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.service.listReports(search, page, limit)
  }

  @Delete('reports/:id')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Delete a report (admin only)' })
  deleteReport(@Param('id') id: string) {
    return this.service.deleteReport(id)
  }

  // ── Entities ──────────────────────────────────────────────────────────────

  @Get('entities')
  @ApiOperation({ summary: 'List entities' })
  listEntities(
    @Query('verified') verifiedRaw?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const verified = verifiedRaw === 'true' ? true : verifiedRaw === 'false' ? false : undefined
    return this.service.listEntities(verified, page, limit)
  }

  @Patch('entities/:id/verify')
  @ApiOperation({ summary: 'Verify or unverify an entity' })
  verifyEntity(@Param('id') id: string, @Body() dto: SetVerifiedDto) {
    return this.service.verifyEntity(id, dto.verified)
  }

  // ── Politicians ───────────────────────────────────────────────────────────

  @Get('politicians')
  @ApiOperation({ summary: 'List politicians' })
  listPoliticians(
    @Query('verified') verifiedRaw?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const verified = verifiedRaw === 'true' ? true : verifiedRaw === 'false' ? false : undefined
    return this.service.listPoliticians(verified, page, limit)
  }

  @Patch('politicians/:id/verify')
  @ApiOperation({ summary: 'Verify or unverify a politician' })
  verifyPolitician(@Param('id') id: string, @Body() dto: SetVerifiedDto) {
    return this.service.verifyPolitician(id, dto.verified)
  }
}
