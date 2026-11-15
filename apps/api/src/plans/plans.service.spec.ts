import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { MembershipStatus, OrgPermission, OrgType } from '@prisma/client'
import { PlansService } from './plans.service'

describe('PlansService', () => {
  let service: PlansService
  let prisma: any

  beforeEach(() => {
    prisma = {
      orgMembership: {
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      memberInvite: {
        count: jest.fn(),
      },
      entity: { findUnique: jest.fn() },
      politician: { findUnique: jest.fn() },
      company: { findUnique: jest.fn() },
    }
    service = new PlansService(prisma)
  })

  it('rejects callers without an active organization context', async () => {
    await expect(service.getMyPlan({ id: 'u1', type: 'CITIZEN', ctx: null })).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('returns politician plan details with tier-resolved maxMembers and member usage', async () => {
    prisma.orgMembership.findUnique.mockResolvedValue({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.MANAGE_MEMBERS] },
    })
    prisma.politician.findUnique.mockResolvedValue({
      name: 'Deputada Maria',
      plan: 'MANDATO',
      office: 'Deputada Estadual',
    })
    prisma.orgMembership.count.mockResolvedValue(2)
    prisma.memberInvite.count.mockResolvedValue(1)

    const res = await service.getMyPlan({
      id: 'u1',
      type: 'CITIZEN',
      ctx: {
        type: 'POLITICIAN',
        id: 'pol-1',
        name: 'Deputada Maria',
        logoUrl: null,
        permissions: [OrgPermission.MANAGE_MEMBERS],
      },
    })

    expect(res.orgType).toBe('POLITICIAN')
    expect(res.plan).toBe('MANDATO')
    expect(res.tier).toBe(3)
    expect(res.limits.maxMembers).toBe(5)
    expect(res.members).toEqual({ active: 2, pending: 1, used: 3, max: 5 })
    expect(res.features.propostas).toBe(true)
    expect(res.features.export_data).toBe(false)
    expect(res.featureStatus.heatmap).toBe('available')
    expect(res.featureStatus.pdf_report).toBe('soon')
  })

  it('returns entity plan details with 30-day history limit on BASICO and unlimited members on INTEGRACAO', async () => {
    prisma.orgMembership.findUnique.mockResolvedValue({
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.RESPOND_REPORTS] },
    })
    prisma.entity.findUnique.mockResolvedValueOnce({
      legalName: 'Prefeitura Teste',
      plan: 'BASICO',
    })
    prisma.orgMembership.count.mockResolvedValueOnce(1)
    prisma.memberInvite.count.mockResolvedValueOnce(0)

    const basico = await service.getMyPlan({
      id: 'u1',
      type: 'CITIZEN',
      ctx: {
        type: OrgType.ENTITY,
        id: 'ent-1',
        name: 'Prefeitura Teste',
        logoUrl: null,
        permissions: [OrgPermission.RESPOND_REPORTS],
      },
    })
    expect(basico.limits).toEqual({ maxMembers: 2, historyDays: 30 })

    prisma.entity.findUnique.mockResolvedValueOnce(null)
    await expect(
      service.getMyPlan({
        id: 'u1',
        type: 'CITIZEN',
        ctx: {
          type: OrgType.ENTITY,
          id: 'ent-missing',
          name: 'Missing',
          logoUrl: null,
          permissions: [],
        },
      }),
    ).rejects.toThrow(NotFoundException)
  })
})
