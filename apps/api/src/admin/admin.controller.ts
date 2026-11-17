import {
  Controller, Get, Delete, Patch, Param, Query, Body,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { EntityPlan, PoliticianPlan, CompanyPlan, ModerationActionType } from '@prisma/client'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { UserType } from '@votz/shared-types'
import { AdminService } from './admin.service'
import { SetApiKeyTierDto } from './dto/set-api-key-tier.dto'
import { SetBanDto } from './dto/ban-user.dto'
import { DeleteReportDto } from './dto/delete-report.dto'
import { SetTypeDto } from './dto/set-type.dto'

class SetVerifiedDto {
  verified: boolean
}

class SetEntityPlanDto {
  @IsEnum(EntityPlan)
  plan: EntityPlan
}

class SetPoliticianPlanDto {
  @IsEnum(PoliticianPlan)
  plan: PoliticianPlan
}

class SetCompanyPlanDto {
  @IsEnum(CompanyPlan)
  plan: CompanyPlan
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

  @Get('superadmin/overview')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Extended superadmin operational overview (admin only)' })
  superadminOverview() {
    return this.service.superadminOverview()
  }

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
  banUser(
    @Param('id') id: string,
    @Body() dto: SetBanDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.service.banUser(id, dto.banned, actor.id, dto.reason)
  }

  @Patch('users/:id/type')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Change user type (admin only)' })
  setUserType(
    @Param('id') id: string,
    @Body() dto: SetTypeDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.service.setUserType(id, dto.type, actor.id, dto.reason)
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
  @Roles(UserType.MODERATOR, UserType.ADMIN)
  @ApiOperation({ summary: 'Delete a report (moderator or admin)' })
  deleteReport(
    @Param('id') id: string,
    @Body() dto: DeleteReportDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.service.deleteReport(id, actor.id, dto.reason)
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

  @Patch('entities/:id/plan')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Set plan for an entity (admin only)' })
  setEntityPlan(@Param('id') id: string, @Body() dto: SetEntityPlanDto) {
    return this.service.setEntityPlan(id, dto.plan)
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

  @Patch('politicians/:id/plan')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Set plan for a politician (admin only)' })
  setPoliticianPlan(@Param('id') id: string, @Body() dto: SetPoliticianPlanDto) {
    return this.service.setPoliticianPlan(id, dto.plan)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  @Get('companies')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'List companies (admin only)' })
  listCompanies(
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.service.listCompanies(search, page, limit)
  }

  @Patch('companies/:id/plan')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Set plan for a company (admin only)' })
  setCompanyPlan(@Param('id') id: string, @Body() dto: SetCompanyPlanDto) {
    return this.service.setCompanyPlan(id, dto.plan)
  }

  // ── API Keys ──────────────────────────────────────────────────────────────

  @Get('api-keys')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'List API keys (admin only)' })
  listApiKeys(
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.service.listApiKeys(search, page, limit)
  }

  @Patch('api-keys/:id/tier')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Change API key tier (admin only)' })
  setApiKeyTier(
    @Param('id') id: string,
    @Body() dto: SetApiKeyTierDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.service.setApiKeyTier(id, dto.tier, actor.id, dto.reason)
  }

  // ── Posts & Audit Logs ────────────────────────────────────────────────────

  @Get('posts')
  @ApiOperation({ summary: 'List posts for moderation' })
  listPosts(
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.service.listPosts(search, page, limit)
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'Delete a post (moderator or admin)' })
  deletePost(
    @Param('id') id: string,
    @Body() dto: DeleteReportDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.service.deletePost(id, actor.id, dto.reason)
  }

  @Get('audit-logs')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'List moderation & admin audit logs (admin only)' })
  listAuditLogs(
    @Query('action') action?: ModerationActionType,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.service.listAuditLogs(action, page, limit)
  }
}
