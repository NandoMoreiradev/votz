import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { MembershipStatus, OrgPermission, OrgType } from '@prisma/client'
import { OrgMembershipsService } from './org-memberships.service'

describe('OrgMembershipsService', () => {
  let service: OrgMembershipsService
  let repo: any
  let prisma: any
  let mail: any

  beforeEach(() => {
    repo = {
      findRoles: jest.fn(),
      createRole: jest.fn(),
      findRoleById: jest.fn(),
      findRoleByName: jest.fn().mockResolvedValue(null),
      updateRole: jest.fn(),
      deleteRole: jest.fn(),
      countMembersByRole: jest.fn().mockResolvedValue(0),
      countPendingInvitesByRole: jest.fn().mockResolvedValue(0),
      findMembers: jest.fn(),
      findMembership: jest.fn(),
      updateMemberRole: jest.fn(),
      updateMemberStatus: jest.fn(),
      removeMember: jest.fn(),
      countActiveOwners: jest.fn().mockResolvedValue(2),
      countActiveMembers: jest.fn().mockResolvedValue(0),
      countSuspendedMembers: jest.fn().mockResolvedValue(0),
      createInvite: jest.fn(),
      findPendingInvites: jest.fn().mockResolvedValue([]),
      findPendingInviteByEmail: jest.fn().mockResolvedValue(null),
      findInviteById: jest.fn(),
      findInvitePreview: jest.fn(),
      findInviteByToken: jest.fn(),
      refreshInviteExpiry: jest.fn(),
      deleteInvite: jest.fn(),
      acceptInvite: jest.fn(),
      acceptInviteAndAddMember: jest.fn(),
      addMember: jest.fn(),
      countPendingInvites: jest.fn().mockResolvedValue(0),
    }
    prisma = {
      user: { findUnique: jest.fn() },
      entity: { findUnique: jest.fn() },
      politician: { findUnique: jest.fn() },
      company: { findUnique: jest.fn() },
    }
    mail = {
      sendMemberInvite: jest.fn().mockResolvedValue(undefined),
    }

    service = new OrgMembershipsService(repo, prisma, mail)
  })

  describe('summary', () => {
    it('returns team counts and plan seat limits', async () => {
      prisma.entity.findUnique.mockResolvedValueOnce({ legalName: 'Prefeitura', plan: 'BASICO' })
      repo.countActiveMembers.mockResolvedValueOnce(1)
      repo.countSuspendedMembers.mockResolvedValueOnce(1)
      repo.countPendingInvites.mockResolvedValueOnce(1)

      const summary = await service.getTeamSummary(OrgType.ENTITY, 'e1')
      expect(summary).toEqual({
        plan: 'BASICO',
        maxMembers: 2,
        activeMembers: 1,
        suspendedMembers: 1,
        pendingInvites: 1,
        usedSlots: 2,
        availableSlots: 0,
      })
    })
  })

  describe('roles', () => {
    it('listRoles and createRole delegate to repository and guard duplicates & privilege escalation', async () => {
      repo.findRoles.mockResolvedValue([{ id: 'r1', name: 'OWNER' }])
      await expect(service.listRoles(OrgType.ENTITY, 'e1')).resolves.toHaveLength(1)

      repo.createRole.mockResolvedValue({ id: 'r2', name: 'ANALYST' })
      const created = await service.createRole({
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        name: '  ANALYST  ',
        permissions: [OrgPermission.VIEW_ANALYTICS],
      } as any)
      expect(repo.createRole).toHaveBeenCalledWith(
        OrgType.ENTITY,
        'e1',
        'ANALYST',
        [OrgPermission.VIEW_ANALYTICS],
        false,
      )
      expect(created.id).toBe('r2')

      // Duplicate role name -> ConflictException
      repo.findRoleByName.mockResolvedValueOnce({ id: 'r2', name: 'ANALYST' })
      await expect(
        service.createRole({
          orgType: OrgType.ENTITY,
          orgId: 'e1',
          name: 'analyst',
          permissions: [OrgPermission.VIEW_ANALYTICS],
        } as any),
      ).rejects.toThrow(ConflictException)

      // Non-owner cannot create role with permissions they do not possess
      repo.findMembership.mockResolvedValueOnce({
        status: MembershipStatus.ACTIVE,
        role: { name: 'MANAGER', permissions: [OrgPermission.MANAGE_MEMBERS] },
      })
      await expect(
        service.createRole(
          {
            orgType: OrgType.ENTITY,
            orgId: 'e1',
            name: 'BillingAdmin',
            permissions: [OrgPermission.MANAGE_BILLING],
          } as any,
          'manager-1',
        ),
      ).rejects.toThrow(ForbiddenException)
    })

    it('updateRole & deleteRole guard missing, wrong-org, default, or in-use roles', async () => {
      repo.findRoleById.mockResolvedValueOnce(null)
      await expect(service.updateRole(OrgType.ENTITY, 'e1', 'r1', { name: 'X' })).rejects.toThrow(NotFoundException)

      repo.findRoleById.mockResolvedValueOnce({
        id: 'r-other',
        orgType: OrgType.ENTITY,
        orgId: 'e-other',
        isDefault: false,
        name: 'Custom',
      })
      await expect(service.updateRole(OrgType.ENTITY, 'e1', 'r-other', { name: 'X' })).rejects.toThrow(NotFoundException)

      repo.findRoleById.mockResolvedValueOnce({
        id: 'r1',
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        isDefault: true,
        name: 'OWNER',
      })
      await expect(service.updateRole(OrgType.ENTITY, 'e1', 'r1', { name: 'X' })).rejects.toThrow(BadRequestException)

      repo.findRoleById.mockResolvedValueOnce(null)
      await expect(service.deleteRole(OrgType.ENTITY, 'e1', 'r1')).rejects.toThrow(NotFoundException)

      repo.findRoleById.mockResolvedValueOnce({
        id: 'r-other',
        orgType: OrgType.ENTITY,
        orgId: 'e-other',
        isDefault: false,
      })
      await expect(service.deleteRole(OrgType.ENTITY, 'e1', 'r-other')).rejects.toThrow(NotFoundException)

      repo.findRoleById.mockResolvedValueOnce({
        id: 'r1',
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        isDefault: true,
      })
      await expect(service.deleteRole(OrgType.ENTITY, 'e1', 'r1')).rejects.toThrow(BadRequestException)

      // Role in use by active member -> ConflictException
      repo.findRoleById.mockResolvedValueOnce({
        id: 'r2',
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        isDefault: false,
      })
      repo.countMembersByRole.mockResolvedValueOnce(2)
      await expect(service.deleteRole(OrgType.ENTITY, 'e1', 'r2')).rejects.toThrow(ConflictException)

      repo.findRoleById.mockResolvedValueOnce({
        id: 'r2',
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        isDefault: false,
      })
      repo.countMembersByRole.mockResolvedValueOnce(0)
      repo.countPendingInvitesByRole.mockResolvedValueOnce(0)
      await service.deleteRole(OrgType.ENTITY, 'e1', 'r2')
      expect(repo.deleteRole).toHaveBeenCalledWith('r2')
    })
  })

  describe('members', () => {
    it('updateMemberRole validates self-change, membership, role, owner protection, and privilege escalation', async () => {
      await expect(service.updateMemberRole('u1', OrgType.ENTITY, 'e1', 'r2', 'u1')).rejects.toThrow(BadRequestException)

      repo.findMembership.mockResolvedValueOnce(null)
      await expect(service.updateMemberRole('u1', OrgType.ENTITY, 'e1', 'r2')).rejects.toThrow(NotFoundException)

      repo.findMembership.mockResolvedValueOnce({ id: 'm1', role: { name: 'AGENT' } })
      repo.findRoleById.mockResolvedValueOnce(null)
      await expect(service.updateMemberRole('u1', OrgType.ENTITY, 'e1', 'r2')).rejects.toThrow(NotFoundException)

      repo.findMembership.mockResolvedValueOnce({ id: 'm1', role: { name: 'AGENT' } })
      repo.findRoleById.mockResolvedValueOnce({ id: 'r-other', orgType: OrgType.ENTITY, orgId: 'e2' })
      await expect(service.updateMemberRole('u1', OrgType.ENTITY, 'e1', 'r-other')).rejects.toThrow(BadRequestException)

      // Non-owner trying to demote OWNER -> ForbiddenException
      repo.findMembership
        .mockResolvedValueOnce({ id: 'm-owner', status: MembershipStatus.ACTIVE, role: { name: 'OWNER' } })
        .mockResolvedValueOnce({ id: 'm-mgr', status: MembershipStatus.ACTIVE, role: { name: 'MANAGER', permissions: [OrgPermission.MANAGE_MEMBERS] } })
      repo.findRoleById.mockResolvedValueOnce({ id: 'r-agent', orgType: OrgType.ENTITY, orgId: 'e1', name: 'AGENT', permissions: [] })
      await expect(service.updateMemberRole('u-owner', OrgType.ENTITY, 'e1', 'r-agent', 'u-mgr')).rejects.toThrow(ForbiddenException)

      // Demoting the last active OWNER -> BadRequestException
      repo.findMembership
        .mockResolvedValueOnce({ id: 'm-owner', status: MembershipStatus.ACTIVE, role: { name: 'OWNER' } })
        .mockResolvedValueOnce({ id: 'm-owner2', status: MembershipStatus.ACTIVE, role: { name: 'OWNER', permissions: Object.values(OrgPermission) } })
      repo.findRoleById.mockResolvedValueOnce({ id: 'r-agent', orgType: OrgType.ENTITY, orgId: 'e1', name: 'AGENT', permissions: [] })
      repo.countActiveOwners.mockResolvedValueOnce(1)
      await expect(service.updateMemberRole('u-owner', OrgType.ENTITY, 'e1', 'r-agent', 'u-owner2')).rejects.toThrow(BadRequestException)

      // Valid role update
      repo.findMembership.mockResolvedValueOnce({ id: 'm1', status: MembershipStatus.ACTIVE, role: { name: 'AGENT' } })
      repo.findRoleById.mockResolvedValueOnce({ id: 'r2', orgType: OrgType.ENTITY, orgId: 'e1', name: 'MANAGER', permissions: [] })
      await service.updateMemberRole('u1', OrgType.ENTITY, 'e1', 'r2')
      expect(repo.updateMemberRole).toHaveBeenCalledWith('u1', OrgType.ENTITY, 'e1', 'r2')
    })

    it('updateMemberStatus guards self, last owner, and plan limit on reactivation', async () => {
      await expect(
        service.updateMemberStatus('u1', OrgType.ENTITY, 'e1', MembershipStatus.SUSPENDED, 'u1'),
      ).rejects.toThrow(BadRequestException)

      repo.findMembership
        .mockResolvedValueOnce({ id: 'm1', status: MembershipStatus.ACTIVE, role: { name: 'OWNER' } })
        .mockResolvedValueOnce({ id: 'm2', status: MembershipStatus.ACTIVE, role: { name: 'OWNER' } })
      repo.countActiveOwners.mockResolvedValueOnce(1)
      await expect(
        service.updateMemberStatus('u1', OrgType.ENTITY, 'e1', MembershipStatus.SUSPENDED, 'u2'),
      ).rejects.toThrow(BadRequestException)

      repo.findMembership.mockResolvedValueOnce({ id: 'm1', status: MembershipStatus.ACTIVE, role: { name: 'AGENT' } })
      await service.updateMemberStatus('u1', OrgType.ENTITY, 'e1', MembershipStatus.SUSPENDED)
      expect(repo.updateMemberStatus).toHaveBeenCalledWith('u1', OrgType.ENTITY, 'e1', MembershipStatus.SUSPENDED)
    })

    it('removeMember guards self, last owner, missing member, and removes otherwise', async () => {
      await expect(service.removeMember('u1', OrgType.ENTITY, 'e1', 'u1')).rejects.toThrow(BadRequestException)

      repo.findMembership.mockResolvedValueOnce(null)
      await expect(service.removeMember('u1', OrgType.ENTITY, 'e1')).rejects.toThrow(NotFoundException)

      repo.findMembership.mockResolvedValueOnce({ id: 'm-owner', status: MembershipStatus.ACTIVE, role: { name: 'OWNER' } })
      repo.countActiveOwners.mockResolvedValueOnce(1)
      await expect(service.removeMember('u1', OrgType.ENTITY, 'e1')).rejects.toThrow(BadRequestException)

      repo.findMembership.mockResolvedValueOnce({ id: 'm1', status: MembershipStatus.ACTIVE, role: { name: 'AGENT' } })
      await service.removeMember('u1', OrgType.ENTITY, 'e1')
      expect(repo.removeMember).toHaveBeenCalledWith('u1', OrgType.ENTITY, 'e1')
    })
  })

  describe('invites', () => {
    it('invite normalizes email, rejects duplicate member/invite or wrong org role, and sends email otherwise', async () => {
      repo.findRoleById.mockResolvedValueOnce({ id: 'r2', orgType: OrgType.COMPANY, orgId: 'c1', name: 'AGENT', permissions: [] })
      await expect(
        service.invite({ orgType: OrgType.ENTITY, orgId: 'e1', email: 'a@b.com', roleId: 'r2' } as any),
      ).rejects.toThrow(BadRequestException)

      repo.findRoleById.mockResolvedValueOnce({ id: 'r2', orgType: OrgType.ENTITY, orgId: 'e1', name: 'AGENT', permissions: [] })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u2' })
      repo.findMembership.mockResolvedValueOnce({ id: 'm-existing' })
      await expect(
        service.invite({ orgType: OrgType.ENTITY, orgId: 'e1', email: 'a@b.com', roleId: 'r2' } as any),
      ).rejects.toThrow(ConflictException)

      // Duplicate pending invite -> ConflictException
      repo.findRoleById.mockResolvedValueOnce({ id: 'r2', orgType: OrgType.ENTITY, orgId: 'e1', name: 'AGENT', permissions: [] })
      prisma.user.findUnique.mockResolvedValueOnce(null)
      repo.findPendingInviteByEmail.mockResolvedValueOnce({ id: 'inv-dup' })
      await expect(
        service.invite({ orgType: OrgType.ENTITY, orgId: 'e1', email: 'Dup@Votz.App', roleId: 'r2' } as any),
      ).rejects.toThrow(ConflictException)

      repo.findRoleById.mockResolvedValueOnce({ id: 'r2', orgType: OrgType.ENTITY, orgId: 'e1', name: 'AGENT', permissions: [] })
      prisma.user.findUnique.mockResolvedValueOnce(null)
      prisma.entity.findUnique.mockResolvedValueOnce({ legalName: 'Prefeitura Teste' })
      repo.createInvite.mockResolvedValueOnce({ id: 'inv1', token: 'tok-123' })

      const res = await service.invite({
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        email: '  Convidado@Votz.App ',
        roleId: 'r2',
      } as any)

      expect(repo.createInvite).toHaveBeenCalledWith(OrgType.ENTITY, 'e1', 'convidado@votz.app', 'r2')
      expect(mail.sendMemberInvite).toHaveBeenCalledWith(
        'convidado@votz.app',
        'Prefeitura Teste',
        'AGENT',
        'tok-123',
      )
      expect(res).toEqual({ id: 'inv1', token: 'tok-123' })
    })

    it('listPendingInvites, resendInvite, and cancelInvite work cleanly', async () => {
      repo.findPendingInvites.mockResolvedValueOnce([
        { id: 'inv1', email: 'a@b.com', roleId: 'r1', token: 't1' },
      ])
      repo.findRoles.mockResolvedValueOnce([
        { id: 'r1', name: 'AGENT', permissions: [OrgPermission.RESPOND_REPORTS], isDefault: true },
      ])
      const list = await service.listPendingInvites(OrgType.ENTITY, 'e1')
      expect(list).toHaveLength(1)
      expect(list[0].role.name).toBe('AGENT')

      repo.findInviteById.mockResolvedValueOnce({
        id: 'inv1',
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        email: 'a@b.com',
        roleId: 'r1',
        acceptedAt: null,
      })
      repo.refreshInviteExpiry.mockResolvedValueOnce({
        id: 'inv1',
        email: 'a@b.com',
        token: 't1',
      })
      repo.findRoleById.mockResolvedValueOnce({ id: 'r1', name: 'AGENT' })
      prisma.entity.findUnique.mockResolvedValueOnce({ legalName: 'Prefeitura', plan: 'BASICO' })
      await service.resendInvite(OrgType.ENTITY, 'e1', 'inv1')
      expect(mail.sendMemberInvite).toHaveBeenCalledWith('a@b.com', 'Prefeitura', 'AGENT', 't1')

      repo.findInviteById.mockResolvedValueOnce({
        id: 'inv1',
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        acceptedAt: null,
      })
      await expect(service.cancelInvite(OrgType.ENTITY, 'e1', 'inv1')).resolves.toEqual({ ok: true })
      expect(repo.deleteInvite).toHaveBeenCalledWith('inv1')
    })

    it('acceptInvite rejects expired or duplicate invites and adds member atomically when valid', async () => {
      repo.findInviteByToken.mockResolvedValueOnce({
        id: 'inv1',
        acceptedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      })
      await expect(service.acceptInvite('tok', 'u1')).rejects.toThrow(BadRequestException)

      repo.findInviteByToken.mockResolvedValueOnce({
        id: 'inv2',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        orgType: OrgType.COMPANY,
        orgId: 'c1',
        roleId: 'r2',
      })
      repo.findMembership.mockResolvedValueOnce({ id: 'already' })
      await expect(service.acceptInvite('tok', 'u1')).rejects.toThrow(ConflictException)

      repo.findInviteByToken.mockResolvedValueOnce({
        id: 'inv3',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        orgType: OrgType.COMPANY,
        orgId: 'c1',
        roleId: 'r2',
      })
      repo.findMembership.mockResolvedValueOnce(null)
      repo.acceptInviteAndAddMember.mockResolvedValue({ id: 'mem1', userId: 'u1', orgId: 'c1' })

      const member = await service.acceptInvite('tok', 'u1')
      expect(repo.acceptInviteAndAddMember).toHaveBeenCalledWith('tok', 'u1', OrgType.COMPANY, 'c1', 'r2')
      expect(member.id).toBe('mem1')
    })

    it('enforces maxMembers limit at invite and accept, allowing unlimited on INTEGRACAO and preserving members on downgrade', async () => {
      repo.findRoleById.mockResolvedValueOnce({ id: 'r1', orgType: OrgType.ENTITY, orgId: 'e1', name: 'AGENT', permissions: [] })
      prisma.user.findUnique.mockResolvedValueOnce(null)
      prisma.entity.findUnique.mockResolvedValueOnce({ legalName: 'Prefeitura', plan: 'BASICO' })
      repo.countActiveMembers.mockResolvedValueOnce(1)
      repo.countPendingInvites.mockResolvedValueOnce(0)
      repo.createInvite.mockResolvedValueOnce({ id: 'inv-ok', token: 't1' })
      await expect(
        service.invite({ orgType: OrgType.ENTITY, orgId: 'e1', email: 'ok@votz.app', roleId: 'r1' } as any),
      ).resolves.toEqual({ id: 'inv-ok', token: 't1' })

      repo.findRoleById.mockResolvedValueOnce({ id: 'r1', orgType: OrgType.ENTITY, orgId: 'e1', name: 'AGENT', permissions: [] })
      prisma.user.findUnique.mockResolvedValueOnce(null)
      prisma.entity.findUnique.mockResolvedValueOnce({ legalName: 'Prefeitura', plan: 'BASICO' })
      repo.countActiveMembers.mockResolvedValueOnce(1)
      repo.countPendingInvites.mockResolvedValueOnce(1)
      await expect(
        service.invite({ orgType: OrgType.ENTITY, orgId: 'e1', email: 'over@votz.app', roleId: 'r1' } as any),
      ).rejects.toMatchObject({
        response: { code: 'PLAN_LIMIT_MEMBERS', limit: 2, current: 2 },
      })

      repo.findInviteByToken.mockResolvedValueOnce({
        id: 'inv-ok',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        roleId: 'r1',
      })
      repo.findMembership.mockResolvedValueOnce(null)
      prisma.entity.findUnique.mockResolvedValueOnce({ legalName: 'Prefeitura', plan: 'BASICO' })
      repo.countActiveMembers.mockResolvedValueOnce(1)
      repo.acceptInviteAndAddMember.mockResolvedValueOnce({ id: 'mem-new' })
      await expect(service.acceptInvite('t1', 'u2')).resolves.toEqual({ id: 'mem-new' })

      repo.findRoleById.mockResolvedValueOnce({ id: 'r1', orgType: OrgType.ENTITY, orgId: 'e1', name: 'AGENT', permissions: [] })
      prisma.user.findUnique.mockResolvedValueOnce(null)
      prisma.entity.findUnique.mockResolvedValueOnce({ legalName: 'Prefeitura', plan: 'BASICO' })
      repo.countActiveMembers.mockResolvedValueOnce(5)
      repo.countPendingInvites.mockResolvedValueOnce(0)
      await expect(
        service.invite({ orgType: OrgType.ENTITY, orgId: 'e1', email: 'after-down@votz.app', roleId: 'r1' } as any),
      ).rejects.toMatchObject({
        response: { code: 'PLAN_LIMIT_MEMBERS', limit: 2, current: 5 },
      })

      repo.findRoleById.mockResolvedValueOnce({ id: 'rp1', orgType: OrgType.POLITICIAN, orgId: 'p1', name: 'ASSESSOR', permissions: [] })
      prisma.user.findUnique.mockResolvedValueOnce(null)
      prisma.politician.findUnique.mockResolvedValueOnce({ name: 'Prefeito X', plan: 'MANDATO', office: 'Prefeito' })
      repo.countActiveMembers.mockResolvedValueOnce(5)
      repo.countPendingInvites.mockResolvedValueOnce(0)
      await expect(
        service.invite({ orgType: OrgType.POLITICIAN, orgId: 'p1', email: 'assessor@votz.app', roleId: 'rp1' } as any),
      ).rejects.toMatchObject({
        response: { code: 'PLAN_LIMIT_MEMBERS', limit: 5, current: 5 },
      })

      repo.findRoleById.mockResolvedValueOnce({ id: 'r1', orgType: OrgType.ENTITY, orgId: 'e2', name: 'AGENT', permissions: [] })
      prisma.user.findUnique.mockResolvedValueOnce(null)
      prisma.entity.findUnique.mockResolvedValueOnce({ legalName: 'Estado', plan: 'INTEGRACAO' })
      repo.createInvite.mockResolvedValueOnce({ id: 'inv-unlim', token: 't-unlim' })
      await expect(
        service.invite({ orgType: OrgType.ENTITY, orgId: 'e2', email: 'extra@votz.app', roleId: 'r1' } as any),
      ).resolves.toEqual({ id: 'inv-unlim', token: 't-unlim' })
    })
  })
})
