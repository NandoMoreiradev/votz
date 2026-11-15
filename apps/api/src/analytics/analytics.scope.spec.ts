import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { MembershipStatus, OrgPermission } from '@prisma/client'
import { ActingUser } from '../auth/acting-org'
import { AnalyticsScopeService } from './analytics.scope'
import { PeriodPreset } from './dto/analytics-query.dto'

describe('AnalyticsScopeService territorial & plan range rules', () => {
  const buildPrismaMock = (overrides?: {
    entity?: { legalName: string; plan: string; state: string; city: string | null } | null
    politician?: {
      name: string
      plan: string
      office: string
      state: string | null
      city: string | null
    } | null
    membershipRole?: string
    cellMatch?: { id: string } | null
  }) => {
    return {
      orgMembership: {
        findUnique: jest.fn().mockResolvedValue({
          status: MembershipStatus.ACTIVE,
          role: {
            permissions: [OrgPermission.VIEW_ANALYTICS, OrgPermission.EXPORT_DATA],
          },
        }),
      },
      entity: {
        findUnique: jest.fn().mockResolvedValue(
          overrides?.entity ?? {
            legalName: 'Prefeitura de Campinas',
            plan: 'BASICO',
            state: 'SP',
            city: 'Campinas',
          },
        ),
      },
      politician: {
        findUnique: jest.fn().mockResolvedValue(overrides?.politician ?? null),
      },
      areaMetricDaily: {
        findFirst: jest.fn().mockResolvedValue(overrides?.cellMatch ?? null),
      },
    } as any
  }

  const actingEntityUser: ActingUser = {
    id: 'user-1',
    type: 'ENTITY',
    ctx: {
      type: 'ENTITY',
      id: 'org-campinas',
      name: 'Campinas',
      logoUrl: null,
      permissions: [OrgPermission.VIEW_ANALYTICS, OrgPermission.EXPORT_DATA],
    },
  }

  const actingPoliticianUser: ActingUser = {
    id: 'user-2',
    type: 'POLITICIAN',
    ctx: {
      type: 'POLITICIAN',
      id: 'pol-1',
      name: 'Politico',
      logoUrl: null,
      permissions: [OrgPermission.VIEW_ANALYTICS, OrgPermission.EXPORT_DATA],
    },
  }

  it('restricts city entity to its normalized city and blocks another city or state with 403', async () => {
    const service = new AnalyticsScopeService(buildPrismaMock())

    const okScope = await service.resolveOrgScope(actingEntityUser, { period: PeriodPreset.D7 })
    expect(okScope.territoryLevel).toBe('CITY')
    expect(okScope.state).toBe('SP')
    expect(okScope.cityKey).toBe('campinas')

    await expect(
      service.resolveOrgScope(actingEntityUser, { cityKey: 'sao paulo' }),
    ).rejects.toThrow(ForbiddenException)

    await expect(
      service.resolveOrgScope(actingEntityUser, { state: 'RJ' }),
    ).rejects.toThrow(ForbiddenException)
  })

  it('blocks Entity BASICO requesting > 30 days history with 403 PLAN_REQUIRED', async () => {
    const service = new AnalyticsScopeService(buildPrismaMock())
    await expect(
      service.resolveOrgScope(actingEntityUser, { period: PeriodPreset.D90 }),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        code: 'PLAN_REQUIRED',
        feature: 'analytics_full',
      }),
    })
  })

  it('grants municipal scope to VEREADOR/PREFEITO and state scope to DEPUTADO/SENADOR', async () => {
    const vereadorService = new AnalyticsScopeService(
      buildPrismaMock({
        politician: {
          name: 'Vereador X',
          plan: 'MANDATO',
          office: 'VEREADOR',
          state: 'MG',
          city: 'Belo Horizonte',
        },
      }),
    )
    const verScope = await vereadorService.resolveOrgScope(actingPoliticianUser, {
      period: PeriodPreset.D30,
    })
    expect(verScope.territoryLevel).toBe('CITY')
    expect(verScope.cityKey).toBe('belo horizonte')

    await expect(
      vereadorService.resolveOrgScope(actingPoliticianUser, { cityKey: 'uberlandia' }),
    ).rejects.toThrow(ForbiddenException)

    const depService = new AnalyticsScopeService(
      buildPrismaMock({
        politician: {
          name: 'Deputada Y',
          plan: 'MANDATO_PRO',
          office: 'DEPUTADO ESTADUAL',
          state: 'BA',
          city: null,
        },
      }),
    )
    const depScope = await depService.resolveOrgScope(actingPoliticianUser, {
      cityKey: 'salvador',
      period: PeriodPreset.D90,
    })
    expect(depScope.territoryLevel).toBe('STATE')
    expect(depScope.cityKey).toBe('salvador')
    expect(depScope.state).toBe('BA')
  })

  it('rejects cell filter outside organization area with 403', async () => {
    const service = new AnalyticsScopeService(buildPrismaMock({ cellMatch: null }))
    await expect(
      service.resolveOrgScope(actingEntityUser, { cell: '6gyf4bf', period: PeriodPreset.D7 }),
    ).rejects.toThrow(ForbiddenException)
  })

  it('rejects ranges above 24 months or invalid from > to with 400', async () => {
    const service = new AnalyticsScopeService(
      buildPrismaMock({
        entity: {
          legalName: 'Prefeitura Pro',
          plan: 'GESTAO',
          state: 'SP',
          city: 'Campinas',
        },
      }),
    )

    await expect(
      service.resolveOrgScope(actingEntityUser, {
        from: '2026-11-10',
        to: '2026-11-01',
      }),
    ).rejects.toThrow(BadRequestException)

    await expect(
      service.resolveOrgScope(actingEntityUser, {
        from: '2024-01-01',
        to: '2026-11-15',
      }),
    ).rejects.toThrow(BadRequestException)
  })
})
