import { Reflector } from '@nestjs/core'
import { ExecutionContext } from '@nestjs/common'
import { MembershipStatus, OrgPermission } from '@prisma/client'
import { ActingUser } from '../auth/acting-org'
import { PlanGuard } from '../auth/guards/plan.guard'
import { ENTITY_PLANS, POLITICIAN_PLANS } from '@votz/shared-types'
import { AnalyticsController } from './analytics.controller'

function buildMockContext(
  handler: Function,
  user: ActingUser,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AnalyticsController,
    switchToHttp: () => ({
      getRequest: () => ({
        params: {},
        user,
      }),
    }),
  } as any
}

describe('AnalyticsController Route x Plan Matrix', () => {
  const routes: Array<{ method: keyof AnalyticsController; name: string }> = [
    { method: 'getOverview', name: 'GET /analytics/overview' },
    { method: 'getCategories', name: 'GET /analytics/categories' },
    { method: 'getTimeseries', name: 'GET /analytics/timeseries' },
    { method: 'getHeatmap', name: 'GET /analytics/heatmap' },
    { method: 'getRecurrence', name: 'GET /analytics/recurrence' },
    { method: 'getResponseTimes', name: 'GET /analytics/responseTimes' },
    { method: 'getOutbreaks', name: 'GET /analytics/outbreaks' },
    { method: 'exportData', name: 'GET /analytics/export' },
    { method: 'getPeerComparison', name: 'GET /analytics/peer-comparison' },
  ]

  const runGuard = async (
    orgType: 'ENTITY' | 'POLITICIAN',
    plan: string,
    method: keyof AnalyticsController,
  ): Promise<boolean | string> => {
    const prismaMock = {
      orgMembership: {
        findUnique: jest.fn().mockResolvedValue({
          status: MembershipStatus.ACTIVE,
          role: {
            permissions: [OrgPermission.VIEW_ANALYTICS, OrgPermission.EXPORT_DATA],
          },
        }),
      },
      entity: { findUnique: jest.fn().mockResolvedValue({ plan }) },
      politician: { findUnique: jest.fn().mockResolvedValue({ plan }) },
      company: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any

    const guard = new PlanGuard(new Reflector(), prismaMock)
    const ctx = buildMockContext(AnalyticsController.prototype[method], {
      id: 'u1',
      type: orgType,
      ctx: {
        type: orgType,
        id: 'org-1',
        name: 'Org 1',
        logoUrl: null,
        permissions: [OrgPermission.VIEW_ANALYTICS, OrgPermission.EXPORT_DATA],
      },
    })

    try {
      return await guard.canActivate(ctx)
    } catch (err: any) {
      return err?.response?.code ?? `ERR_${err?.status ?? 'UNKNOWN'}`
    }
  }

  it('enforces exact plan access across every ENTITY plan for all private routes', async () => {
    const entityMatrix: Record<string, Record<string, boolean | string>> = {
      BASICO: {
        getOverview: true,
        getCategories: true,
        getTimeseries: 'PLAN_REQUIRED',
        getHeatmap: 'PLAN_REQUIRED',
        getRecurrence: 'PLAN_REQUIRED',
        getResponseTimes: 'PLAN_REQUIRED',
        getOutbreaks: 'PLAN_REQUIRED',
        exportData: 'PLAN_REQUIRED',
        getPeerComparison: 'PLAN_REQUIRED',
      },
      GESTAO: {
        getOverview: true,
        getCategories: true,
        getTimeseries: true,
        getHeatmap: true,
        getRecurrence: true,
        getResponseTimes: true,
        getOutbreaks: true,
        exportData: true,
        getPeerComparison: 'PLAN_REQUIRED',
      },
      INTEGRACAO: {
        getOverview: true,
        getCategories: true,
        getTimeseries: true,
        getHeatmap: true,
        getRecurrence: true,
        getResponseTimes: true,
        getOutbreaks: true,
        exportData: true,
        getPeerComparison: true,
      },
    }

    for (const plan of Object.keys(ENTITY_PLANS)) {
      for (const route of routes) {
        const res = await runGuard('ENTITY', plan, route.method)
        expect({ plan, route: route.name, res }).toEqual({
          plan,
          route: route.name,
          res: entityMatrix[plan][route.method],
        })
      }
    }
  })

  it('enforces exact plan access across every POLITICIAN plan for all private routes', async () => {
    const politicianMatrix: Record<string, Record<string, boolean | string>> = {
      BASICO: {
        getOverview: true,
        getCategories: true,
        getTimeseries: 'PLAN_REQUIRED',
        getHeatmap: 'PLAN_REQUIRED',
        getRecurrence: 'PLAN_REQUIRED',
        getResponseTimes: 'PLAN_REQUIRED',
        getOutbreaks: 'PLAN_REQUIRED',
        exportData: 'PLAN_REQUIRED',
        getPeerComparison: 'PLAN_REQUIRED',
      },
      MANDATO: {
        getOverview: true,
        getCategories: true,
        getTimeseries: true,
        getHeatmap: true,
        getRecurrence: true,
        getResponseTimes: true,
        getOutbreaks: true,
        exportData: 'PLAN_REQUIRED',
        getPeerComparison: 'PLAN_REQUIRED',
      },
      MANDATO_PRO: {
        getOverview: true,
        getCategories: true,
        getTimeseries: true,
        getHeatmap: true,
        getRecurrence: true,
        getResponseTimes: true,
        getOutbreaks: true,
        exportData: true,
        getPeerComparison: true,
      },
    }

    for (const plan of Object.keys(POLITICIAN_PLANS)) {
      for (const route of routes) {
        const res = await runGuard('POLITICIAN', plan, route.method)
        expect({ plan, route: route.name, res }).toEqual({
          plan,
          route: route.name,
          res: politicianMatrix[plan][route.method],
        })
      }
    }
  })

  it('allows public transparency endpoints without authentication (@Public metadata)', () => {
    const reflector = new Reflector()
    const publicMethods: Array<keyof AnalyticsController> = [
      'getPublicMunicipality',
      'getPublicEntity',
      'getPublicPolitician',
    ]
    for (const method of publicMethods) {
      const isPublic = reflector.get<boolean>('isPublic', AnalyticsController.prototype[method])
      expect(isPublic).toBe(true)
    }
  })
})
