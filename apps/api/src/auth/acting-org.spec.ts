import { ForbiddenException } from '@nestjs/common'
import { MembershipStatus, OrgPermission, OrgType } from '@prisma/client'
import { UserType } from '@votz/shared-types'
import {
  MISSING_ORG_CONTEXT_MESSAGE,
  requireActingOrg,
  resolveOptionalActingOrg,
} from './acting-org'

describe('requireActingOrg & resolveOptionalActingOrg', () => {
  const makePrisma = (membership: { status: string; role: { permissions: OrgPermission[] } } | null) =>
    ({
      orgMembership: {
        findUnique: jest.fn().mockResolvedValue(membership),
      },
    }) as any

  const citizenUser = { id: 'u1', type: UserType.CITIZEN, ctx: null }
  const legacyEntityUserNoCtx = { id: 'u1', type: UserType.ENTITY, ctx: null }
  const activeEntityUser = {
    id: 'u1',
    type: UserType.CITIZEN,
    ctx: {
      type: 'ENTITY' as const,
      id: 'ent-2',
      name: 'Entidade 2',
      logoUrl: null,
      permissions: [OrgPermission.RESPOND_REPORTS],
    },
  }

  it('rejects with canonical Portuguese MFA-context message when user.ctx is null (even with legacy type)', async () => {
    const prisma = makePrisma({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.RESPOND_REPORTS] },
    })

    await expect(
      requireActingOrg(prisma, citizenUser, 'ENTITY', OrgPermission.RESPOND_REPORTS),
    ).rejects.toThrow(new ForbiddenException(MISSING_ORG_CONTEXT_MESSAGE))

    await expect(
      requireActingOrg(prisma, legacyEntityUserNoCtx, 'ENTITY', OrgPermission.RESPOND_REPORTS),
    ).rejects.toThrow(new ForbiddenException(MISSING_ORG_CONTEXT_MESSAGE))
  })

  it('rejects when ctx.type does not match expected organization type', async () => {
    const prisma = makePrisma({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.MANAGE_PROFILE] },
    })

    await expect(
      requireActingOrg(prisma, activeEntityUser, 'POLITICIAN', OrgPermission.MANAGE_PROFILE),
    ).rejects.toThrow(ForbiddenException)
  })

  it('rejects when ctx.id does not match expectedOrgId (cross-org attempt)', async () => {
    const prisma = makePrisma({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.RESPOND_REPORTS] },
    })

    await expect(
      requireActingOrg(prisma, activeEntityUser, 'ENTITY', OrgPermission.RESPOND_REPORTS, {
        expectedOrgId: 'ent-1',
      }),
    ).rejects.toThrow(ForbiddenException)
    expect(prisma.orgMembership.findUnique).not.toHaveBeenCalled()
  })

  it('rejects suspended or inactive member even with valid 15m JWT context', async () => {
    const prismaSuspended = makePrisma({
      status: MembershipStatus.SUSPENDED,
      role: { permissions: [OrgPermission.RESPOND_REPORTS] },
    })
    await expect(
      requireActingOrg(prismaSuspended, activeEntityUser, 'ENTITY', OrgPermission.RESPOND_REPORTS),
    ).rejects.toThrow(ForbiddenException)

    const prismaMissing = makePrisma(null)
    await expect(
      requireActingOrg(prismaMissing, activeEntityUser, 'ENTITY', OrgPermission.RESPOND_REPORTS),
    ).rejects.toThrow(ForbiddenException)
  })

  it('enforces live DB role permission (AGENT cannot MANAGE_PROFILE; VIEWER cannot RESPOND_REPORTS)', async () => {
    const agentPrisma = makePrisma({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.RESPOND_REPORTS, OrgPermission.VIEW_ANALYTICS] },
    })

    const agentPolUser = {
      id: 'u-agent',
      type: UserType.CITIZEN,
      ctx: {
        type: 'POLITICIAN' as const,
        id: 'pol-1',
        name: 'Gabinete',
        logoUrl: null,
        permissions: [OrgPermission.RESPOND_REPORTS, OrgPermission.VIEW_ANALYTICS],
      },
    }

    await expect(
      requireActingOrg(agentPrisma, agentPolUser, 'POLITICIAN', OrgPermission.RESPOND_REPORTS),
    ).resolves.toMatchObject({ orgType: 'POLITICIAN', orgId: 'pol-1' })

    await expect(
      requireActingOrg(agentPrisma, agentPolUser, 'POLITICIAN', OrgPermission.MANAGE_PROFILE),
    ).rejects.toThrow(ForbiddenException)

    // Even if stale token still claims RESPOND_REPORTS, DB demotion to VIEWER blocks action
    const demotedViewerPrisma = makePrisma({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.VIEW_ANALYTICS] },
    })
    await expect(
      requireActingOrg(demotedViewerPrisma, agentPolUser, 'POLITICIAN', OrgPermission.RESPOND_REPORTS),
    ).rejects.toThrow(ForbiddenException)
  })

  it('uses ctx.id strictly for multi-org users instead of findFirst', async () => {
    const prisma = makePrisma({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.RESPOND_REPORTS] },
    })

    const res = await requireActingOrg(prisma, activeEntityUser, ['ENTITY', 'POLITICIAN'], OrgPermission.RESPOND_REPORTS)

    expect(res.orgType).toBe('ENTITY')
    expect(res.orgId).toBe('ent-2')
    expect(prisma.orgMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_orgType_orgId: {
            userId: 'u1',
            orgType: OrgType.ENTITY,
            orgId: 'ent-2',
          },
        },
      }),
    )
  })

  it('resolveOptionalActingOrg returns null for citizens or removed memberships and orgId for active members', async () => {
    const prisma = makePrisma({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.VIEW_ANALYTICS] },
    })

    await expect(resolveOptionalActingOrg(prisma, citizenUser, ['ENTITY', 'POLITICIAN'])).resolves.toBeNull()
    await expect(resolveOptionalActingOrg(prisma, activeEntityUser, ['ENTITY', 'POLITICIAN'])).resolves.toMatchObject({
      orgType: 'ENTITY',
      orgId: 'ent-2',
    })

    const inactivePrisma = makePrisma({
      status: MembershipStatus.SUSPENDED,
      role: { permissions: [OrgPermission.RESPOND_REPORTS] },
    })
    await expect(
      resolveOptionalActingOrg(inactivePrisma, activeEntityUser, ['ENTITY', 'POLITICIAN']),
    ).resolves.toBeNull()
  })
})
