import { SetMetadata } from '@nestjs/common'
import { OrgType, EntityPlan, PoliticianPlan, CompanyPlan } from '@prisma/client'

export const PLAN_KEY = 'requiredPlan'

export type AnyPlan = EntityPlan | PoliticianPlan | CompanyPlan

export const RequiresPlan = (plan: AnyPlan, orgType: OrgType) =>
  SetMetadata(PLAN_KEY, { plan, orgType })
