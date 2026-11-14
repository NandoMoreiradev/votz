import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { OrgPermission, OrgType } from '@prisma/client'
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
      updateRole: jest.fn(),
      deleteRole: jest.fn(),
      findMembers: jest.fn(),
      findMembership: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
      createInvite: jest.fn(),
      findInvitePreview: jest.fn(),
      findInviteByToken: jest.fn(),
      acceptInvite: jest.fn(),
      addMember: jest.fn(),
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

  describe('roles', () => {
    it('listRoles and createRole delegate to repository', async () => {
      repo.findRoles.mockResolvedValue([{ id: 'r1', name: 'OWNER' }])
      await expect(service.listRoles(OrgType.ENTITY, 'e1')).resolves.toHaveLength(1)

      repo.createRole.mockResolvedValue({ id: 'r2', name: 'ANALYST' })
      const created = await service.createRole({
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        name: 'ANALYST',
        permissions: [OrgPermission.VIEW_ANALYTICS],
        isDefault: false,
      } as any)
      expect(repo.createRole).toHaveBeenCalledWith(
        OrgType.ENTITY,
        'e1',
        'ANALYST',
        [OrgPermission.VIEW_ANALYTICS],
        false,
      )
      expect(created.id).toBe('r2')
    })

    it('updateRole & deleteRole guard missing or default roles', async () => {
      repo.findRoleById.mockResolvedValueOnce(null)
      await expect(service.updateRole('r1', { name: 'X' })).rejects.toThrow(NotFoundException)

      repo.findRoleById.mockResolvedValueOnce({ id: 'r1', isDefault: true })
      await expect(service.updateRole('r1', { name: 'X' })).rejects.toThrow(BadRequestException)

      repo.findRoleById.mockResolvedValueOnce(null)
      await expect(service.deleteRole('r1')).rejects.toThrow(NotFoundException)

      repo.findRoleById.mockResolvedValueOnce({ id: 'r1', isDefault: true })
      await expect(service.deleteRole('r1')).rejects.toThrow(BadRequestException)

      repo.findRoleById.mockResolvedValueOnce({ id: 'r2', isDefault: false })
      await service.deleteRole('r2')
      expect(repo.deleteRole).toHaveBeenCalledWith('r2')
    })
  })

  describe('members', () => {
    it('updateMemberRole validates membership and role existence', async () => {
      repo.findMembership.mockResolvedValueOnce(null)
      await expect(service.updateMemberRole('u1', OrgType.ENTITY, 'e1', 'r2')).rejects.toThrow(NotFoundException)

      repo.findMembership.mockResolvedValueOnce({ id: 'm1' })
      repo.findRoleById.mockResolvedValueOnce(null)
      await expect(service.updateMemberRole('u1', OrgType.ENTITY, 'e1', 'r2')).rejects.toThrow(NotFoundException)

      repo.findMembership.mockResolvedValueOnce({ id: 'm1' })
      repo.findRoleById.mockResolvedValueOnce({ id: 'r2' })
      await service.updateMemberRole('u1', OrgType.ENTITY, 'e1', 'r2')
      expect(repo.updateMemberRole).toHaveBeenCalledWith('u1', OrgType.ENTITY, 'e1', 'r2')
    })

    it('removeMember throws NotFoundException when missing and removes otherwise', async () => {
      repo.findMembership.mockResolvedValueOnce(null)
      await expect(service.removeMember('u1', OrgType.ENTITY, 'e1')).rejects.toThrow(NotFoundException)

      repo.findMembership.mockResolvedValueOnce({ id: 'm1' })
      await service.removeMember('u1', OrgType.ENTITY, 'e1')
      expect(repo.removeMember).toHaveBeenCalledWith('u1', OrgType.ENTITY, 'e1')
    })
  })

  describe('invites', () => {
    it('invite rejects duplicate member or wrong org role, and sends email otherwise', async () => {
      repo.findRoleById.mockResolvedValueOnce({ id: 'r2', orgType: OrgType.COMPANY, orgId: 'c1', name: 'AGENT' })
      await expect(
        service.invite({ orgType: OrgType.ENTITY, orgId: 'e1', email: 'a@b.com', roleId: 'r2' } as any),
      ).rejects.toThrow(BadRequestException)

      repo.findRoleById.mockResolvedValueOnce({ id: 'r2', orgType: OrgType.ENTITY, orgId: 'e1', name: 'AGENT' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u2' })
      repo.findMembership.mockResolvedValueOnce({ id: 'm-existing' })
      await expect(
        service.invite({ orgType: OrgType.ENTITY, orgId: 'e1', email: 'a@b.com', roleId: 'r2' } as any),
      ).rejects.toThrow(ConflictException)

      repo.findRoleById.mockResolvedValueOnce({ id: 'r2', orgType: OrgType.ENTITY, orgId: 'e1', name: 'AGENT' })
      prisma.user.findUnique.mockResolvedValueOnce(null)
      prisma.entity.findUnique.mockResolvedValueOnce({ legalName: 'Prefeitura Teste' })
      repo.createInvite.mockResolvedValueOnce({ id: 'inv1', token: 'tok-123' })

      const res = await service.invite({
        orgType: OrgType.ENTITY,
        orgId: 'e1',
        email: 'convidado@votz.app',
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

    it('acceptInvite rejects expired or duplicate invites and adds member when valid', async () => {
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
      repo.addMember.mockResolvedValue({ id: 'mem1', userId: 'u1', orgId: 'c1' })

      const member = await service.acceptInvite('tok', 'u1')
      expect(repo.acceptInvite).toHaveBeenCalledWith('tok')
      expect(repo.addMember).toHaveBeenCalledWith('u1', OrgType.COMPANY, 'c1', 'r2')
      expect(member.id).toBe('mem1')
    })
  })
})
