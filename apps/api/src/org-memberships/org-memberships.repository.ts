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
  role: { select: { id: true, name: true, permissions: true, isDefault: true } },
}

const INVITE_SELECT = {
  id: true,
  orgType: true,
  orgId: true,
  email: true,
  roleId: true,
  token: true,
  expiresAt: true,
  acceptedAt: true,
  createdAt: true,
}

const OWNER_ROLE_NAMES = ['OWNER', 'Proprietário']
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

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
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })
  }

  findRoleById(id: string) {
    return this.prisma.orgRole.findUnique({ where: { id } })
  }

  findRoleByName(orgType: OrgType, orgId: string, name: string) {
    return this.prisma.orgRole.findFirst({
      where: { orgType, orgId, name: { equals: name, mode: 'insensitive' } },
      select: ROLE_SELECT,
    })
  }

  updateRole(id: string, data: { name?: string; permissions?: OrgPermission[] }) {
    return this.prisma.orgRole.update({ where: { id }, data, select: ROLE_SELECT })
  }

  deleteRole(id: string) {
    return this.prisma.orgRole.delete({ where: { id } })
  }

  countMembersByRole(roleId: string) {
    return this.prisma.orgMembership.count({ where: { roleId } })
  }

  countPendingInvitesByRole(roleId: string) {
    return this.prisma.memberInvite.count({
      where: {
        roleId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    })
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

  updateMemberStatus(userId: string, orgType: OrgType, orgId: string, status: MembershipStatus) {
    return this.prisma.orgMembership.update({
      where: { userId_orgType_orgId: { userId, orgType, orgId } },
      data: { status },
      select: MEMBERSHIP_SELECT,
    })
  }

  removeMember(userId: string, orgType: OrgType, orgId: string) {
    return this.prisma.orgMembership.delete({
      where: { userId_orgType_orgId: { userId, orgType, orgId } },
    })
  }

  countActiveOwners(orgType: OrgType, orgId: string) {
    return this.prisma.orgMembership.count({
      where: {
        orgType,
        orgId,
        status: MembershipStatus.ACTIVE,
        role: { name: { in: OWNER_ROLE_NAMES } },
      },
    })
  }

  countActiveMembers(orgType: OrgType, orgId: string) {
    return this.prisma.orgMembership.count({
      where: { orgType, orgId, status: MembershipStatus.ACTIVE },
    })
  }

  countSuspendedMembers(orgType: OrgType, orgId: string) {
    return this.prisma.orgMembership.count({
      where: { orgType, orgId, status: MembershipStatus.SUSPENDED },
    })
  }

  // ── Invites ────────────────────────────────────────────────────────────────

  createInvite(orgType: OrgType, orgId: string, email: string, roleId: string) {
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    return this.prisma.memberInvite.create({
      data: { orgType, orgId, email, roleId, expiresAt },
      select: INVITE_SELECT,
    })
  }

  findPendingInvites(orgType: OrgType, orgId: string) {
    return this.prisma.memberInvite.findMany({
      where: {
        orgType,
        orgId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: INVITE_SELECT,
      orderBy: { createdAt: 'desc' },
    })
  }

  findPendingInviteByEmail(orgType: OrgType, orgId: string, email: string) {
    return this.prisma.memberInvite.findFirst({
      where: {
        orgType,
        orgId,
        email: { equals: email, mode: 'insensitive' },
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: INVITE_SELECT,
    })
  }

  findInviteById(id: string) {
    return this.prisma.memberInvite.findUnique({ where: { id }, select: INVITE_SELECT })
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

  refreshInviteExpiry(id: string) {
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    return this.prisma.memberInvite.update({
      where: { id },
      data: { expiresAt },
      select: INVITE_SELECT,
    })
  }

  deleteInvite(id: string) {
    return this.prisma.memberInvite.delete({ where: { id } })
  }

  acceptInvite(token: string) {
    return this.prisma.memberInvite.update({
      where: { token },
      data: { acceptedAt: new Date() },
    })
  }

  acceptInviteAndAddMember(
    token: string,
    userId: string,
    orgType: OrgType,
    orgId: string,
    roleId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.memberInvite.update({
        where: { token },
        data: { acceptedAt: new Date() },
      })
      return tx.orgMembership.create({
        data: { userId, orgType, orgId, roleId, status: MembershipStatus.ACTIVE },
        select: MEMBERSHIP_SELECT,
      })
    })
  }

  countPendingInvites(orgType: OrgType, orgId: string) {
    return this.prisma.memberInvite.count({
      where: {
        orgType,
        orgId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    })
  }
}
