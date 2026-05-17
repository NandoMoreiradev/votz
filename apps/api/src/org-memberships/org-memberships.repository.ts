import { Injectable } from '@nestjs/common'
import { OrgPermission, OrgType, MembershipStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const ROLE_SELECT = {
  id: true,
  name: true,
  permissions: true,
  isDefault: true,
  orgType: true,
  orgId: true,
}

const MEMBERSHIP_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
  role: { select: { id: true, name: true, permissions: true } },
}

@Injectable()
export class OrgMembershipsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Roles ──────────────────────────────────────────────────────────────────

  createRole(orgType: OrgType, orgId: string, name: string, permissions: OrgPermission[], isDefault = false) {
    return this.prisma.orgRole.create({
      data: { orgType, orgId, name, permissions, isDefault },
      select: ROLE_SELECT,
    })
  }

  findRoles(orgType: OrgType, orgId: string) {
    return this.prisma.orgRole.findMany({
      where: { orgType, orgId },
      select: ROLE_SELECT,
      orderBy: { name: 'asc' },
    })
  }

  findRoleById(id: string) {
    return this.prisma.orgRole.findUnique({ where: { id } })
  }

  updateRole(id: string, data: { name?: string; permissions?: OrgPermission[] }) {
    return this.prisma.orgRole.update({ where: { id }, data, select: ROLE_SELECT })
  }

  deleteRole(id: string) {
    return this.prisma.orgRole.delete({ where: { id } })
  }

  // ── Memberships ────────────────────────────────────────────────────────────

  findMembers(orgType: OrgType, orgId: string) {
    return this.prisma.orgMembership.findMany({
      where: { orgType, orgId },
      select: MEMBERSHIP_SELECT,
      orderBy: { createdAt: 'asc' },
    })
  }

  findMembership(userId: string, orgType: OrgType, orgId: string) {
    return this.prisma.orgMembership.findUnique({
      where: { userId_orgType_orgId: { userId, orgType, orgId } },
      include: { role: true },
    })
  }

  addMember(userId: string, orgType: OrgType, orgId: string, roleId: string) {
    return this.prisma.orgMembership.create({
      data: { userId, orgType, orgId, roleId, status: MembershipStatus.ACTIVE },
      select: MEMBERSHIP_SELECT,
    })
  }

  updateMemberRole(userId: string, orgType: OrgType, orgId: string, roleId: string) {
    return this.prisma.orgMembership.update({
      where: { userId_orgType_orgId: { userId, orgType, orgId } },
      data: { roleId },
      select: MEMBERSHIP_SELECT,
    })
  }

  removeMember(userId: string, orgType: OrgType, orgId: string) {
    return this.prisma.orgMembership.delete({
      where: { userId_orgType_orgId: { userId, orgType, orgId } },
    })
  }

  // ── Invites ────────────────────────────────────────────────────────────────

  createInvite(orgType: OrgType, orgId: string, email: string, roleId: string) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    return this.prisma.memberInvite.create({
      data: { orgType, orgId, email, roleId, expiresAt },
    })
  }

  findInviteByToken(token: string) {
    return this.prisma.memberInvite.findUnique({ where: { token } })
  }

  findInvitePreview(token: string) {
    return this.prisma.memberInvite.findUnique({
      where: { token },
      select: {
        orgType: true,
        orgId: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        roleId: true,
      },
    })
  }

  acceptInvite(token: string) {
    return this.prisma.memberInvite.update({
      where: { token },
      data: { acceptedAt: new Date() },
    })
  }
}
