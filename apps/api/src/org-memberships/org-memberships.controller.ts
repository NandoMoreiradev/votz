import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { OrgPermission, OrgType } from '@prisma/client'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { OrgMembershipsService } from './org-memberships.service'
import { OrgPermissionGuard, RequireOrgPermission } from './org-memberships.guard'
import { InviteMemberDto } from './dto/invite-member.dto'
import { CreateRoleDto } from './dto/create-role.dto'
import { UpdateMemberRoleDto } from './dto/update-member-role.dto'

@ApiTags('org-memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('org-memberships')
export class OrgMembershipsController {
  constructor(private readonly service: OrgMembershipsService) {}

  // ── Roles ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Listar roles de uma organização' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.MANAGE_MEMBERS)
  @Get(':orgType/:orgId/roles')
  listRoles(
    @Param('orgType') orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ) {
    return this.service.listRoles(orgType, orgId)
  }

  @ApiOperation({ summary: 'Criar role customizada' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.MANAGE_MEMBERS)
  @Post('roles')
  createRole(@Body() dto: CreateRoleDto) {
    return this.service.createRole(dto)
  }

  @ApiOperation({ summary: 'Atualizar role customizada' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.MANAGE_MEMBERS)
  @Patch('roles/:id')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateRoleDto>,
  ) {
    return this.service.updateRole(id, { name: dto.name, permissions: dto.permissions })
  }

  @ApiOperation({ summary: 'Excluir role customizada' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.MANAGE_MEMBERS)
  @Delete('roles/:id')
  deleteRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRole(id)
  }

  // ── Members ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Listar membros de uma organização' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.MANAGE_MEMBERS)
  @Get(':orgType/:orgId/members')
  listMembers(
    @Param('orgType') orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ) {
    return this.service.listMembers(orgType, orgId)
  }

  @ApiOperation({ summary: 'Trocar role de um membro' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.MANAGE_MEMBERS)
  @Patch(':orgType/:orgId/members/:userId/role')
  updateMemberRole(
    @Param('orgType') orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.service.updateMemberRole(userId, orgType, orgId, dto.roleId)
  }

  @ApiOperation({ summary: 'Remover membro da organização' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.MANAGE_MEMBERS)
  @Delete(':orgType/:orgId/members/:userId')
  removeMember(
    @Param('orgType') orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.removeMember(userId, orgType, orgId)
  }

  // ── Invites ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Convidar usuário por e-mail' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.MANAGE_MEMBERS)
  @Post('invites')
  invite(@Body() dto: InviteMemberDto) {
    return this.service.invite(dto)
  }

  @ApiOperation({ summary: 'Preview de convite (público)' })
  @Public()
  @Get('invites/:token')
  previewInvite(@Param('token') token: string) {
    return this.service.previewInvite(token)
  }

  @ApiOperation({ summary: 'Aceitar convite via token' })
  @Post('invites/:token/accept')
  acceptInvite(
    @Param('token') token: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.acceptInvite(token, user.id)
  }
}
