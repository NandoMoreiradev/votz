import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { MembershipStatus, OrgPermission } from '@prisma/client'
import { PlanGuard } from './plan.guard'
import { FEATURE_METADATA_KEY } from '../decorators/requires-feature.decorator'

function mockExecutionContext(
  metadata: any,
  user: any,
  params: Record<string, string> = {},
): { context: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === FEATURE_METADATA_KEY ? metadata : undefined,
    ),
  } as unknown as Reflector

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
  } as unknown as ExecutionContext

  return { context, reflector }
}

describe('PlanGuard (@RequiresFeature)', () => {
  let prisma: any

  beforeEach(() => {
    prisma = {
      orgMembership: { findUnique: jest.fn() },
      entity: { findUnique: jest.fn() },
      politician: { findUnique: jest.fn() },
      company: { findUnique: jest.fn() },
    }
  })

  it('blocks entity BASICO from export_data with structured 403 PLAN_REQUIRED', async () => {
    prisma.orgMembership.findUnique.mockResolvedValue({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.EXPORT_DATA] },
    })
    prisma.entity.findUnique.mockResolvedValue({ plan: 'BASICO' })

    const { context, reflector } = mockExecutionContext(
      { feature: 'export_data', orgType: 'ENTITY', permission: OrgPermission.EXPORT_DATA },
      {
        id: 'u1',
        type: 'CITIZEN',
        ctx: { type: 'ENTITY', id: 'e1', permissions: [OrgPermission.EXPORT_DATA] },
      },
      { id: 'e1' },
    )
    const guard = new PlanGuard(reflector, prisma)

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: {
        statusCode: 403,
        code: 'PLAN_REQUIRED',
        feature: 'export_data',
        requiredPlan: 'GESTAO',
      },
    })
  })

  it('allows entity GESTAO to access export_data', async () => {
    prisma.orgMembership.findUnique.mockResolvedValue({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.EXPORT_DATA] },
    })
    prisma.entity.findUnique.mockResolvedValue({ plan: 'GESTAO' })

    const { context, reflector } = mockExecutionContext(
      { feature: 'export_data', orgType: 'ENTITY', permission: OrgPermission.EXPORT_DATA },
      {
        id: 'u1',
        type: 'CITIZEN',
        ctx: { type: 'ENTITY', id: 'e1', permissions: [OrgPermission.EXPORT_DATA] },
      },
      { id: 'e1' },
    )
    const guard = new PlanGuard(reflector, prisma)

    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  it('blocks politician MANDATO from export_data and allows MANDATO_PRO', async () => {
    prisma.orgMembership.findUnique.mockResolvedValue({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.EXPORT_DATA] },
    })

    const user = {
      id: 'u1',
      type: 'CITIZEN',
      ctx: { type: 'POLITICIAN', id: 'p1', permissions: [OrgPermission.EXPORT_DATA] },
    }

    prisma.politician.findUnique.mockResolvedValueOnce({ plan: 'MANDATO' })
    const denied = mockExecutionContext(
      { feature: 'export_data', orgType: 'POLITICIAN', permission: OrgPermission.EXPORT_DATA },
      user,
      { id: 'p1' },
    )
    await expect(new PlanGuard(denied.reflector, prisma).canActivate(denied.context)).rejects.toMatchObject({
      response: {
        code: 'PLAN_REQUIRED',
        feature: 'export_data',
        requiredPlan: 'MANDATO_PRO',
      },
    })

    prisma.politician.findUnique.mockResolvedValueOnce({ plan: 'MANDATO_PRO' })
    const allowed = mockExecutionContext(
      { feature: 'export_data', orgType: 'POLITICIAN', permission: OrgPermission.EXPORT_DATA },
      user,
      { id: 'p1' },
    )
    await expect(new PlanGuard(allowed.reflector, prisma).canActivate(allowed.context)).resolves.toBe(true)
  })

  it('rejects active org mismatch against route :id parameter', async () => {
    const { context, reflector } = mockExecutionContext(
      { feature: 'export_data', orgType: 'ENTITY', permission: OrgPermission.EXPORT_DATA },
      {
        id: 'u1',
        type: 'CITIZEN',
        ctx: { type: 'ENTITY', id: 'e-other', permissions: [OrgPermission.EXPORT_DATA] },
      },
      { id: 'e1' },
    )
    const guard = new PlanGuard(reflector, prisma)
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
  })
})
