import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { OrgPermission, OrgType } from '@prisma/client'
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

@Injectable()
export class OrgMembershipsService {
  private readonly logger = new Logger(OrgMembershipsService.name)

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
    return this.repo.createRole(dto.orgType, dto.orgId, dto.name, dto.permissions, false)
  }

  async updateRole(
    orgType: OrgType,
    orgId: string,
    id: string,
    data: { name?: string; permissions?: OrgPermission[] },
  ) {
    const role = await this.repo.findRoleById(id)
    if (!role || role.orgType !== orgType || role.orgId !== orgId) {
      throw new NotFoundException('Role não encontrada')
    }
    if (role.isDefault) throw new BadRequestException('Não é possível editar roles padrão')
    return this.repo.updateRole(id, data)
  }

  async deleteRole(orgType: OrgType, orgId: string, id: string) {
    const role = await this.repo.findRoleById(id)
    if (!role || role.orgType !== orgType || role.orgId !== orgId) {
      throw new NotFoundException('Role não encontrada')
    }
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
    if (role.orgType !== orgType || role.orgId !== orgId) {
      throw new BadRequestException('Role não pertence a esta organização')
    }
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

    const orgInfo = await this.resolveOrgSummary(dto.orgType, dto.orgId)
    await this.assertCanReserveSlot(dto.orgType, dto.orgId, orgInfo.plan, orgInfo.office)

    const invite = await this.repo.createInvite(dto.orgType, dto.orgId, dto.email, dto.roleId)
    this.mail.sendMemberInvite(dto.email, orgInfo.name, role.name, invite.token)
    return invite
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
   * Ao aceitar convite, verifica apenas membros ACTIVE atuais contra o limite do plano vigente.
   * Assim o próprio convite pendente não bloqueia a vaga reservada, mas planos rebaixados
   * posteriormente impedem novas entradas acima do limite.
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

    await this.repo.acceptInvite(token)
    return this.repo.addMember(userId, invite.orgType, invite.orgId, invite.roleId)
  }
}
