import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { MembershipStatus, OrgPermission, OrgType } from '@prisma/client'
import {
  OrgPlanType,
  getMaxMembers,
  getPoliticianTier,
} from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { planMemberLimitException } from '../auth/plan-errors'
import { OrgMembershipsRepository } from './org-memberships.repository'
import { InviteMemberDto } from './dto/invite-member.dto'
import { CreateRoleDto } from './dto/create-role.dto'

function isOwnerRole(role?: { name?: string | null } | null): boolean {
  return role?.name === 'OWNER' || role?.name === 'Proprietário'
}

@Injectable()
export class OrgMembershipsService {
  private readonly logger = new Logger(OrgMembershipsService.name)

  constructor(
    private readonly repo: OrgMembershipsRepository,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ── Summary / Plan Quota ───────────────────────────────────────────────────

  async getTeamSummary(orgType: OrgType, orgId: string) {
    const orgInfo = await this.resolveOrgSummary(orgType, orgId)
    const maxMembers = this.resolveMaxMembersLimit(orgType, orgInfo.plan, orgInfo.office)
    const [activeMembers, suspendedMembers, pendingInvites] = await Promise.all([
      this.repo.countActiveMembers(orgType, orgId),
      this.repo.countSuspendedMembers(orgType, orgId),
      this.repo.countPendingInvites(orgType, orgId),
    ])
    const active = activeMembers ?? 0
    const suspended = suspendedMembers ?? 0
    const pending = pendingInvites ?? 0
    const usedSlots = active + pending

    return {
      plan: orgInfo.plan,
      maxMembers,
      activeMembers: active,
      suspendedMembers: suspended,
      pendingInvites: pending,
      usedSlots,
      availableSlots: maxMembers === null ? null : Math.max(0, maxMembers - usedSlots),
    }
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  listRoles(orgType: OrgType, orgId: string) {
    return this.repo.findRoles(orgType, orgId)
  }

  async createRole(dto: CreateRoleDto, actorUserId?: string) {
    const name = dto.name.trim()
    if (!name) throw new BadRequestException('Nome do cargo é obrigatório')

    await this.assertActorCanAssignPermissions(
      actorUserId,
      dto.orgType,
      dto.orgId,
      dto.permissions,
      false,
    )

    const existing = await this.repo.findRoleByName(dto.orgType, dto.orgId, name)
    if (existing) {
      throw new ConflictException('Já existe um cargo com este nome')
    }

    return this.repo.createRole(dto.orgType, dto.orgId, name, dto.permissions, false)
  }

  async updateRole(
    orgType: OrgType,
    orgId: string,
    id: string,
    data: { name?: string; permissions?: OrgPermission[] },
    actorUserId?: string,
  ) {
    const role = await this.repo.findRoleById(id)
    if (!role || role.orgType !== orgType || role.orgId !== orgId) {
      throw new NotFoundException('Role não encontrada')
    }
    if (role.isDefault) throw new BadRequestException('Não é possível editar roles padrão')

    const nextName = data.name !== undefined ? data.name.trim() : undefined
    if (nextName !== undefined && !nextName) {
      throw new BadRequestException('Nome do cargo é obrigatório')
    }

    if (nextName && nextName.toLowerCase() !== role.name.toLowerCase()) {
      const duplicate = await this.repo.findRoleByName(orgType, orgId, nextName)
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('Já existe um cargo com este nome')
      }
    }

    if (data.permissions) {
      await this.assertActorCanAssignPermissions(actorUserId, orgType, orgId, data.permissions, false)
    }

    return this.repo.updateRole(id, {
      ...(nextName !== undefined ? { name: nextName } : {}),
      ...(data.permissions !== undefined ? { permissions: data.permissions } : {}),
    })
  }

  async deleteRole(orgType: OrgType, orgId: string, id: string) {
    const role = await this.repo.findRoleById(id)
    if (!role || role.orgType !== orgType || role.orgId !== orgId) {
      throw new NotFoundException('Role não encontrada')
    }
    if (role.isDefault) throw new BadRequestException('Não é possível excluir roles padrão')

    const [membersUsing, invitesUsing] = await Promise.all([
      this.repo.countMembersByRole(id),
      this.repo.countPendingInvitesByRole(id),
    ])
    if ((membersUsing ?? 0) > 0 || (invitesUsing ?? 0) > 0) {
      throw new ConflictException(
        'Não é possível excluir um cargo que ainda possui membros ou convites pendentes',
      )
    }

    return this.repo.deleteRole(id)
  }

  // ── Memberships ────────────────────────────────────────────────────────────

  listMembers(orgType: OrgType, orgId: string) {
    return this.repo.findMembers(orgType, orgId)
  }

  async updateMemberRole(
    userId: string,
    orgType: OrgType,
    orgId: string,
    roleId: string,
    actorUserId?: string,
  ) {
    if (actorUserId && actorUserId === userId) {
      throw new BadRequestException('Você não pode alterar o próprio cargo')
    }

    const membership = await this.repo.findMembership(userId, orgType, orgId)
    if (!membership) throw new NotFoundException('Membro não encontrado')

    const role = await this.repo.findRoleById(roleId)
    if (!role) throw new NotFoundException('Role não encontrada')
    if (role.orgType !== orgType || role.orgId !== orgId) {
      throw new BadRequestException('Role não pertence a esta organização')
    }

    const targetIsOwner = isOwnerRole(membership.role)
    const nextIsOwner = isOwnerRole(role)

    if (actorUserId) {
      const actor = await this.repo.findMembership(actorUserId, orgType, orgId)
      if (!actor || actor.status !== MembershipStatus.ACTIVE) {
        throw new ForbiddenException('Você não é membro ativo desta organização')
      }
      if (targetIsOwner && !isOwnerRole(actor.role)) {
        throw new ForbiddenException('Apenas proprietários podem alterar o cargo de outro proprietário')
      }
      this.assertActorPermissionsCover(actor.role, role.permissions, nextIsOwner)
    }

    if (targetIsOwner && !nextIsOwner && membership.status === MembershipStatus.ACTIVE) {
      const activeOwners = await this.repo.countActiveOwners(orgType, orgId)
      if ((activeOwners ?? 0) <= 1) {
        throw new BadRequestException('A organização precisa manter pelo menos um proprietário ativo')
      }
    }

    return this.repo.updateMemberRole(userId, orgType, orgId, roleId)
  }

  async updateMemberStatus(
    userId: string,
    orgType: OrgType,
    orgId: string,
    status: MembershipStatus,
    actorUserId?: string,
  ) {
    if (actorUserId && actorUserId === userId) {
      throw new BadRequestException('Você não pode alterar o status do próprio acesso')
    }

    const membership = await this.repo.findMembership(userId, orgType, orgId)
    if (!membership) throw new NotFoundException('Membro não encontrado')

    const targetIsOwner = isOwnerRole(membership.role)
    if (actorUserId && targetIsOwner) {
      const actor = await this.repo.findMembership(actorUserId, orgType, orgId)
      if (!actor || !isOwnerRole(actor.role)) {
        throw new ForbiddenException('Apenas proprietários podem suspender ou reativar outro proprietário')
      }
    }

    if (
      status === MembershipStatus.SUSPENDED &&
      targetIsOwner &&
      membership.status === MembershipStatus.ACTIVE
    ) {
      const activeOwners = await this.repo.countActiveOwners(orgType, orgId)
      if ((activeOwners ?? 0) <= 1) {
        throw new BadRequestException('Não é possível suspender o único proprietário ativo')
      }
    }

    if (status === MembershipStatus.ACTIVE && membership.status !== MembershipStatus.ACTIVE) {
      const orgInfo = await this.resolveOrgSummary(orgType, orgId)
      await this.assertCanAcceptSlot(orgType, orgId, orgInfo.plan, orgInfo.office)
    }

    return this.repo.updateMemberStatus(userId, orgType, orgId, status)
  }

  async removeMember(userId: string, orgType: OrgType, orgId: string, actorUserId?: string) {
    if (actorUserId && actorUserId === userId) {
      throw new BadRequestException('Você não pode remover a si mesmo da equipe')
    }

    const membership = await this.repo.findMembership(userId, orgType, orgId)
    if (!membership) throw new NotFoundException('Membro não encontrado')

    const targetIsOwner = isOwnerRole(membership.role)
    if (actorUserId && targetIsOwner) {
      const actor = await this.repo.findMembership(actorUserId, orgType, orgId)
      if (!actor || !isOwnerRole(actor.role)) {
        throw new ForbiddenException('Apenas proprietários podem remover outro proprietário')
      }
    }

    if (targetIsOwner && membership.status === MembershipStatus.ACTIVE) {
      const activeOwners = await this.repo.countActiveOwners(orgType, orgId)
      if ((activeOwners ?? 0) <= 1) {
        throw new BadRequestException('Não é possível remover o único proprietário ativo')
      }
    }

    return this.repo.removeMember(userId, orgType, orgId)
  }

  // ── Invites ────────────────────────────────────────────────────────────────

  async listPendingInvites(orgType: OrgType, orgId: string) {
    const [invites, roles] = await Promise.all([
      this.repo.findPendingInvites(orgType, orgId),
      this.repo.findRoles(orgType, orgId),
    ])
    const roleMap = new Map(roles.map((r) => [r.id, r]))
    return invites.map((inv) => {
      const role = roleMap.get(inv.roleId)
      return {
        ...inv,
        role: role
          ? { id: role.id, name: role.name, permissions: role.permissions, isDefault: role.isDefault }
          : { id: inv.roleId, name: 'Cargo removido', permissions: [], isDefault: false },
      }
    })
  }

  async invite(dto: InviteMemberDto, actorUserId?: string) {
    const email = dto.email.trim().toLowerCase()
    const role = await this.repo.findRoleById(dto.roleId)
    if (!role) throw new NotFoundException('Role não encontrada')
    if (role.orgType !== dto.orgType || role.orgId !== dto.orgId) {
      throw new BadRequestException('Role não pertence a esta organização')
    }

    await this.assertActorCanAssignPermissions(
      actorUserId,
      dto.orgType,
      dto.orgId,
      role.permissions ?? [],
      isOwnerRole(role),
    )

    const user = await this.prisma.user.findUnique({ where: { email } })
    if (user) {
      const existing = await this.repo.findMembership(user.id, dto.orgType, dto.orgId)
      if (existing) throw new ConflictException('Usuário já é membro desta organização')
    }

    const pendingInvite = await this.repo.findPendingInviteByEmail(dto.orgType, dto.orgId, email)
    if (pendingInvite) {
      throw new ConflictException(
        'Já existe um convite pendente para este e-mail. Você pode reenviar ou cancelar na aba de convites.',
      )
    }

    const orgInfo = await this.resolveOrgSummary(dto.orgType, dto.orgId)
    await this.assertCanReserveSlot(dto.orgType, dto.orgId, orgInfo.plan, orgInfo.office)

    const invite = await this.repo.createInvite(dto.orgType, dto.orgId, email, dto.roleId)
    this.mail.sendMemberInvite(email, orgInfo.name, role.name, invite.token)
    return invite
  }

  async resendInvite(orgType: OrgType, orgId: string, inviteId: string) {
    const invite = await this.repo.findInviteById(inviteId)
    if (!invite || invite.orgType !== orgType || invite.orgId !== orgId) {
      throw new NotFoundException('Convite não encontrado')
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('Este convite já foi aceito')
    }

    const [updated, role, orgInfo] = await Promise.all([
      this.repo.refreshInviteExpiry(inviteId),
      this.repo.findRoleById(invite.roleId),
      this.resolveOrgSummary(orgType, orgId),
    ])

    this.mail.sendMemberInvite(updated.email, orgInfo.name, role?.name ?? '', updated.token)
    return updated
  }

  async cancelInvite(orgType: OrgType, orgId: string, inviteId: string) {
    const invite = await this.repo.findInviteById(inviteId)
    if (!invite || invite.orgType !== orgType || invite.orgId !== orgId) {
      throw new NotFoundException('Convite não encontrado')
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('Não é possível cancelar um convite já aceito')
    }

    await this.repo.deleteInvite(inviteId)
    return { ok: true }
  }

  // ── Internal guards & helpers ──────────────────────────────────────────────

  private async assertActorCanAssignPermissions(
    actorUserId: string | undefined,
    orgType: OrgType,
    orgId: string,
    targetPermissions: OrgPermission[],
    targetIsOwnerRole: boolean,
  ): Promise<void> {
    if (!actorUserId) return
    const actor = await this.repo.findMembership(actorUserId, orgType, orgId)
    if (!actor || actor.status !== MembershipStatus.ACTIVE) {
      throw new ForbiddenException('Você não é membro ativo desta organização')
    }
    this.assertActorPermissionsCover(actor.role, targetPermissions, targetIsOwnerRole)
  }

  private assertActorPermissionsCover(
    actorRole: { name?: string | null; permissions?: OrgPermission[] },
    targetPermissions: OrgPermission[],
    targetIsOwnerRole: boolean,
  ): void {
    if (isOwnerRole(actorRole)) return
    if (targetIsOwnerRole) {
      throw new ForbiddenException('Apenas proprietários podem atribuir o cargo de Proprietário')
    }
    const actorPerms = new Set(actorRole.permissions ?? [])
    const unauthorized = targetPermissions.filter((p) => !actorPerms.has(p))
    if (unauthorized.length > 0) {
      throw new ForbiddenException('Você não pode conceder permissões que não possui')
    }
  }

  private async resolveOrgSummary(
    orgType: OrgType,
    orgId: string,
  ): Promise<{ name: string; plan: string; office?: string }> {
    if (orgType === OrgType.ENTITY) {
      const e = await this.prisma.entity.findUnique({
        where: { id: orgId },
        select: { legalName: true, plan: true },
      })
      return { name: e?.legalName ?? 'Organização', plan: e?.plan ?? 'BASICO' }
    }
    if (orgType === OrgType.POLITICIAN) {
      const p = await this.prisma.politician.findUnique({
        where: { id: orgId },
        select: { name: true, plan: true, office: true },
      })
      return {
        name: p?.name ?? 'Político',
        plan: p?.plan ?? 'BASICO',
        office: p?.office,
      }
    }
    if (orgType === OrgType.COMPANY) {
      const c = await this.prisma.company.findUnique({
        where: { id: orgId },
        select: { tradeName: true, plan: true },
      })
      return { name: c?.tradeName ?? 'Empresa', plan: c?.plan ?? 'STARTER' }
    }
    return { name: 'Organização', plan: 'BASICO' }
  }

  private resolveMaxMembersLimit(orgType: OrgType, plan: string, office?: string): number | null {
    const tier =
      orgType === OrgType.POLITICIAN ? getPoliticianTier(office, this.logger) : undefined
    return getMaxMembers(orgType as OrgPlanType, plan, tier)
  }

  /**
   * Garante limite de assentos ao enviar novo convite (ACTIVE + convites pendentes válidos).
   * Nota: rebaixar um plano nunca remove membros existentes; apenas impede novos convites/entradas.
   */
  private async assertCanReserveSlot(
    orgType: OrgType,
    orgId: string,
    plan: string,
    office?: string,
  ): Promise<void> {
    const limit = this.resolveMaxMembersLimit(orgType, plan, office)
    if (limit === null) return

    const [activeCount, pendingCount] = await Promise.all([
      this.repo.countActiveMembers(orgType, orgId),
      this.repo.countPendingInvites(orgType, orgId),
    ])
    const current = (activeCount ?? 0) + (pendingCount ?? 0)
    if (current >= limit) {
      throw planMemberLimitException(limit, current)
    }
  }

  /**
   * Ao aceitar convite (ou reativar membro), verifica membros ACTIVE atuais contra o limite vigente.
   */
  private async assertCanAcceptSlot(
    orgType: OrgType,
    orgId: string,
    plan: string,
    office?: string,
  ): Promise<void> {
    const limit = this.resolveMaxMembersLimit(orgType, plan, office)
    if (limit === null) return

    const activeCount = (await this.repo.countActiveMembers(orgType, orgId)) ?? 0
    if (activeCount >= limit) {
      throw planMemberLimitException(limit, activeCount)
    }
  }

  async previewInvite(token: string) {
    const invite = await this.repo.findInvitePreview(token)
    if (!invite) throw new NotFoundException('Convite não encontrado')

    const { name: orgName } = await this.resolveOrgSummary(invite.orgType, invite.orgId)
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

    const orgInfo = await this.resolveOrgSummary(invite.orgType, invite.orgId)
    await this.assertCanAcceptSlot(invite.orgType, invite.orgId, orgInfo.plan, orgInfo.office)

    return this.repo.acceptInviteAndAddMember(
      token,
      userId,
      invite.orgType,
      invite.orgId,
      invite.roleId,
    )
  }
}
