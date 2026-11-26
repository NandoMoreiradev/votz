import { Test } from '@nestjs/testing'
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common'
import { OrgPermission, OrgType } from '@prisma/client'
import { OrgMembershipsController } from './org-memberships.controller'
import { OrgMembershipsService } from './org-memberships.service'
import { OrgPermissionGuard } from './org-memberships.guard'
import { OrgMembershipsRepository } from './org-memberships.repository'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'

const ORG_A_ID = '11111111-1111-4111-8111-111111111111'
const ORG_B_ID = '22222222-2222-4222-8222-222222222222'
const ROLE_B_ID = '33333333-3333-4333-8333-333333333333'

describe('OrgMembershipsController (M2 BOLA & DTO validation)', () => {
  let app: INestApplication
  let baseUrl: string
  let repo: any

  beforeEach(async () => {
    repo = {
      findMembership: jest.fn(async (_userId: string, _orgType: OrgType, orgId: string) => {
        if (orgId === ORG_A_ID) {
          return { status: 'ACTIVE', role: { permissions: [OrgPermission.MANAGE_MEMBERS] } }
        }
        return null
      }),
      findRoleById: jest.fn(async (id: string) => {
        if (id === ROLE_B_ID) {
          return { id: ROLE_B_ID, orgType: OrgType.ENTITY, orgId: ORG_B_ID, isDefault: false }
        }
        return null
      }),
      findRoleByName: jest.fn().mockResolvedValue(null),
      countMembersByRole: jest.fn().mockResolvedValue(0),
      countPendingInvitesByRole: jest.fn().mockResolvedValue(0),
      createRole: jest.fn(async (orgType, orgId, name, permissions, isDefault) => ({
        id: 'new-role',
        orgType,
        orgId,
        name,
        permissions,
        isDefault,
      })),
      updateRole: jest.fn(),
      deleteRole: jest.fn(),
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [OrgMembershipsController],
      providers: [
        OrgMembershipsService,
        OrgPermissionGuard,
        { provide: OrgMembershipsRepository, useValue: repo },
        { provide: PrismaService, useValue: {} },
        { provide: MailService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 'admin-org-a' }
          return true
        },
      })
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns 404 when a MANAGE_MEMBERS admin of Org A tries to update or delete a role from Org B', async () => {
    const patchRes = await fetch(
      `${baseUrl}/org-memberships/ENTITY/${ORG_A_ID}/roles/${ROLE_B_ID}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked' }),
      },
    )
    expect(patchRes.status).toBe(404)
    expect(repo.updateRole).not.toHaveBeenCalled()

    const delRes = await fetch(
      `${baseUrl}/org-memberships/ENTITY/${ORG_A_ID}/roles/${ROLE_B_ID}`,
      { method: 'DELETE' },
    )
    expect(delRes.status).toBe(404)
    expect(repo.deleteRole).not.toHaveBeenCalled()
  })

  it('rejects invalid PATCH body and rejects client-supplied isDefault on POST /roles with 400', async () => {
    const invalidPatchRes = await fetch(
      `${baseUrl}/org-memberships/ENTITY/${ORG_A_ID}/roles/${ROLE_B_ID}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: ['NOT_A_PERMISSION'] }),
      },
    )
    expect(invalidPatchRes.status).toBe(400)

    const forgedDefaultRes = await fetch(`${baseUrl}/org-memberships/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgType: OrgType.ENTITY,
        orgId: ORG_A_ID,
        name: 'CustomRole',
        permissions: [OrgPermission.VIEW_ANALYTICS],
        isDefault: true,
      }),
    })
    expect(forgedDefaultRes.status).toBe(400)
    expect(repo.createRole).not.toHaveBeenCalled()
  })

  it('rejects invalid orgType enum in URL with 400 (instead of 500)', async () => {
    const getRes = await fetch(
      `${baseUrl}/org-memberships/INVALID_ORG/${ORG_A_ID}/roles`,
    )
    expect(getRes.status).toBe(400)

    const patchRes = await fetch(
      `${baseUrl}/org-memberships/INVALID_ORG/${ORG_A_ID}/roles/${ROLE_B_ID}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      },
    )
    expect(patchRes.status).toBe(400)

    const delRes = await fetch(
      `${baseUrl}/org-memberships/INVALID_ORG/${ORG_A_ID}/roles/${ROLE_B_ID}`,
      { method: 'DELETE' },
    )
    expect(delRes.status).toBe(400)
    expect(repo.findMembership).not.toHaveBeenCalled()
  })
})
