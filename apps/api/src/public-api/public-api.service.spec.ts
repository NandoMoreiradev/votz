import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { MembershipStatus, OrgPermission, OrgType } from '@prisma/client'
import { PublicApiService } from './public-api.service'
import { PublicApiRepository } from './public-api.repository'

const mockRepo = {
  findReports: jest.fn(),
  findReportById: jest.fn(),
  findSurtos: jest.fn(),
  getTendencias: jest.fn(),
  findEntities: jest.fn(),
  findEntityById: jest.fn(),
  findReportsForEntity: jest.fn(),
}

function makeEntityApiService(options: {
  memberships: Array<{
    userId: string
    orgId: string
    status?: MembershipStatus
    permissions: OrgPermission[]
  }>
  entities: Record<string, { id: string; legalName: string; state: string; city: string; plan: string }>
}) {
  const prisma = {
    orgMembership: {
      findMany: jest.fn(async ({ where }: any) =>
        options.memberships
          .filter(
            (m) =>
              m.userId === where.userId &&
              (m.status ?? MembershipStatus.ACTIVE) === where.status &&
              OrgType.ENTITY === where.orgType &&
              (!where.orgId || m.orgId === where.orgId),
          )
          .map((m) => ({ orgId: m.orgId, role: { permissions: m.permissions } })),
      ),
    },
    entity: {
      findUnique: jest.fn(async ({ where }: any) => options.entities[where.id] ?? null),
    },
  }
  const analyticsRepo = {
    fetchDirectedSummary: jest.fn(async () => ({
      createdCount: 12,
      resolvedCount: 8,
      openCurrentCount: 4,
      openOver7dCount: 2,
      contestedCount: 0,
      responseCount: 10,
      resolutionDurationCount: 8,
      supportCount: 15,
      commentCount: 4,
      slaMetCount: 9,
      slaBreachedCount: 1,
      pressureSum: 100,
      respBuckets: [4, 4, 2, 0, 0, 0, 0, 0],
      resBuckets: [0, 2, 4, 2, 0, 0, 0, 0],
    })),
    fetchCategoryBreakdown: jest.fn(async () => []),
  }
  return new PublicApiService(mockRepo as any, prisma as any, analyticsRepo as any)
}

describe('PublicApiService', () => {
  let service: PublicApiService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicApiService,
        { provide: PublicApiRepository, useValue: mockRepo },
      ],
    }).compile()

    service = module.get(PublicApiService)
    jest.clearAllMocks()
  })

  it('throws NotFoundException for missing report or entity', async () => {
    mockRepo.findReportById.mockResolvedValue(null)
    await expect(service.findReportById('r1')).rejects.toThrow(NotFoundException)

    mockRepo.findEntityById.mockResolvedValue(null)
    await expect(service.findEntityById('e1')).rejects.toThrow(NotFoundException)
  })

  it('defaults invalid period to 30 days in getTendencias', () => {
    service.getTendencias(45)
    expect(mockRepo.getTendencias).toHaveBeenCalledWith(30)

    service.getTendencias(90)
    expect(mockRepo.getTendencias).toHaveBeenCalledWith(90)
  })

  it('P1: enforces role permissions (VIEW_ANALYTICS / EXPORT_DATA), active status, multi-entity 400, cross-org 403, and PLAN_REQUIRED', async () => {
    const svc = makeEntityApiService({
      memberships: [
        { userId: 'u-no-perm', orgId: 'ent-int-1', permissions: [OrgPermission.RESPOND_REPORTS] },
        { userId: 'u-viewer-only', orgId: 'ent-int-1', permissions: [OrgPermission.VIEW_ANALYTICS] },
        { userId: 'u-export-only', orgId: 'ent-int-1', permissions: [OrgPermission.EXPORT_DATA] },
        {
          userId: 'u-suspended',
          orgId: 'ent-int-1',
          status: MembershipStatus.SUSPENDED,
          permissions: [OrgPermission.VIEW_ANALYTICS, OrgPermission.EXPORT_DATA],
        },
        {
          userId: 'u-multi',
          orgId: 'ent-int-1',
          permissions: [OrgPermission.VIEW_ANALYTICS, OrgPermission.EXPORT_DATA],
        },
        {
          userId: 'u-multi',
          orgId: 'ent-int-2',
          permissions: [OrgPermission.VIEW_ANALYTICS, OrgPermission.EXPORT_DATA],
        },
        {
          userId: 'u-basico',
          orgId: 'ent-basico',
          permissions: [OrgPermission.VIEW_ANALYTICS, OrgPermission.EXPORT_DATA],
        },
        {
          userId: 'u-gestao',
          orgId: 'ent-gestao',
          permissions: [OrgPermission.VIEW_ANALYTICS, OrgPermission.EXPORT_DATA],
        },
      ],
      entities: {
        'ent-int-1': { id: 'ent-int-1', legalName: 'Ent Int 1', state: 'SP', city: 'Campinas', plan: 'INTEGRACAO' },
        'ent-int-2': { id: 'ent-int-2', legalName: 'Ent Int 2', state: 'RJ', city: 'Niterói', plan: 'INTEGRACAO' },
        'ent-basico': { id: 'ent-basico', legalName: 'Ent Básico', state: 'SP', city: 'Santos', plan: 'BASICO' },
        'ent-gestao': { id: 'ent-gestao', legalName: 'Ent Gestão', state: 'SP', city: 'Sorocaba', plan: 'GESTAO' },
      },
    })

    // Membro sem permissão -> 403
    await expect(svc.getMyEntityAggregates('u-no-perm', 30)).rejects.toThrow(ForbiddenException)
    await expect(svc.getMyEntityReports('u-no-perm', {} as any)).rejects.toThrow(ForbiddenException)

    // Separação VIEW_ANALYTICS (agregados) vs EXPORT_DATA (relatos)
    await expect(svc.getMyEntityAggregates('u-viewer-only', 30)).resolves.toBeDefined()
    await expect(svc.getMyEntityReports('u-viewer-only', {} as any)).rejects.toThrow(ForbiddenException)
    mockRepo.findReportsForEntity.mockResolvedValueOnce({ data: [], meta: { total: 0 } })
    await expect(svc.getMyEntityReports('u-export-only', {} as any)).resolves.toBeDefined()
    await expect(svc.getMyEntityAggregates('u-export-only', 30)).rejects.toThrow(ForbiddenException)

    // Membro suspenso -> 403
    await expect(svc.getMyEntityAggregates('u-suspended', 30)).rejects.toThrow(ForbiddenException)
    await expect(svc.getMyEntityReports('u-suspended', {} as any)).rejects.toThrow(ForbiddenException)

    // Usuário em duas entidades ativas sem entityId -> 400
    await expect(svc.getMyEntityAggregates('u-multi', 30)).rejects.toThrow(BadRequestException)
    await expect(svc.getMyEntityReports('u-multi', {} as any)).rejects.toThrow(BadRequestException)

    // Com entityId próprio explícito funciona e respeita escopo
    const agg2 = await svc.getMyEntityAggregates('u-multi', 30, 'ent-int-2')
    expect(agg2.entity.id).toBe('ent-int-2')

    // entityId de outra organização -> 403
    await expect(svc.getMyEntityAggregates('u-multi', 30, 'ent-gestao')).rejects.toThrow(ForbiddenException)
    await expect(svc.getMyEntityReports('u-multi', {} as any, 'ent-basico')).rejects.toThrow(ForbiddenException)

    // Plano Básico / Gestão -> 403 PLAN_REQUIRED
    for (const uid of ['u-basico', 'u-gestao']) {
      try {
        await svc.getMyEntityAggregates(uid, 30)
        throw new Error('Expected ForbiddenException')
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException)
        expect((err as ForbiddenException).getResponse()).toMatchObject({ code: 'PLAN_REQUIRED' })
      }
    }
  })
})
