import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { OrgPermission, OrgType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { OrgMembershipsRepository } from './org-memberships.repository'
import { InviteMemberDto } from './dto/invite-member.dto'
import { CreateRoleDto } from './dto/create-role.dto'

@Injectable()
export class OrgMembershipsService {
  constructor(
    private readonly repo: OrgMembershipsRepository,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ── Roles ──────────────────────────────────────────────────────────────────

  listRoles(orgType: OrgType, orgId: string) {
    return this.repo.findRoles(orgType, orgId)
  }

  createRole(dto: CreateRoleDto) {
    return this.repo.createRole(dto.orgType, dto.orgId, dto.name, dto.permissions, dto.isDefault)
  }

  async updateRole(id: string, data: { name?: string; permissions?: OrgPermission[] }) {
    const role = await this.repo.findRoleById(id)
    if (!role) throw new NotFoundException('Role não encontrada')
    if (role.isDefault) throw new BadRequestException('Não é possível editar roles padrão')
    return this.repo.updateRole(id, data)
  }

  async deleteRole(id: string) {
    const role = await this.repo.findRoleById(id)
    if (!role) throw new NotFoundException('Role não encontrada')
    if (role.isDefault) throw new BadRequestException('Não é possível excluir roles padrão')
    return this.repo.deleteRole(id)
  }

  // ── Memberships ────────────────────────────────────────────────────────────

  listMembers(orgType: OrgType, orgId: string) {
    return this.repo.findMembers(orgType, orgId)
  }

  async updateMemberRole(userId: string, orgType: OrgType, orgId: string, roleId: string) {
    const membership = await this.repo.findMembership(userId, orgType, orgId)
    if (!membership) throw new NotFoundException('Membro não encontrado')
    const role = await this.repo.findRoleById(roleId)
    if (!role) throw new NotFoundException('Role não encontrada')
    return this.repo.updateMemberRole(userId, orgType, orgId, roleId)
  }

  async removeMember(userId: string, orgType: OrgType, orgId: string) {
    const membership = await this.repo.findMembership(userId, orgType, orgId)
    if (!membership) throw new NotFoundException('Membro não encontrado')
    return this.repo.removeMember(userId, orgType, orgId)
  }

  // ── Invites ────────────────────────────────────────────────────────────────

  async invite(dto: InviteMemberDto) {
    const role = await this.repo.findRoleById(dto.roleId)
    if (!role) throw new NotFoundException('Role não encontrada')
    if (role.orgType !== dto.orgType || role.orgId !== dto.orgId) {
      throw new BadRequestException('Role não pertence a esta organização')
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (user) {
      const existing = await this.repo.findMembership(user.id, dto.orgType, dto.orgId)
      if (existing) throw new ConflictException('Usuário já é membro desta organização')
    }

    const orgName = await this.resolveOrgName(dto.orgType, dto.orgId)
    const invite = await this.repo.createInvite(dto.orgType, dto.orgId, dto.email, dto.roleId)
    this.mail.sendMemberInvite(dto.email, orgName, role.name, invite.token)
    return invite
  }

  private async resolveOrgName(orgType: OrgType, orgId: string): Promise<string> {
    if (orgType === OrgType.ENTITY) {
      const e = await this.prisma.entity.findUnique({ where: { id: orgId }, select: { legalName: true } })
      return e?.legalName ?? 'Organização'
    }
    if (orgType === OrgType.POLITICIAN) {
      const p = await this.prisma.politician.findUnique({ where: { id: orgId }, select: { name: true } })
      return p?.name ?? 'Político'
    }
    if (orgType === OrgType.COMPANY) {
      const c = await this.prisma.company.findUnique({ where: { id: orgId }, select: { tradeName: true } })
      return c?.tradeName ?? 'Empresa'
    }
    return 'Organização'
  }

  async previewInvite(token: string) {
    const invite = await this.repo.findInvitePreview(token)
    if (!invite) throw new NotFoundException('Convite não encontrado')

    const orgName = await this.resolveOrgName(invite.orgType, invite.orgId)
    const role = await this.repo.findRoleById(invite.roleId)

    return {
      orgType: invite.orgType,
      orgId: invite.orgId,
      orgName,
      roleName: role?.name ?? '',
      email: invite.email,
      expiresAt: invite.expiresAt,
      alreadyAccepted: !!invite.acceptedAt,
      expired: invite.expiresAt < new Date(),
    }
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.repo.findInviteByToken(token)
    if (!invite) throw new NotFoundException('Convite não encontrado')
    if (invite.acceptedAt) throw new BadRequestException('Convite já utilizado')
    if (invite.expiresAt < new Date()) throw new BadRequestException('Convite expirado')

    const existing = await this.repo.findMembership(userId, invite.orgType, invite.orgId)
    if (existing) throw new ConflictException('Você já é membro desta organização')

    await this.repo.acceptInvite(token)
    return this.repo.addMember(userId, invite.orgType, invite.orgId, invite.roleId)
  }
}
