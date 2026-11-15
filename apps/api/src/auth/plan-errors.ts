import { ForbiddenException } from '@nestjs/common'
import {
  FeatureKey,
  OrgPlanType,
  getRequiredPlanForFeature,
} from '@votz/shared-types'

export function planRequiredException(
  orgType: OrgPlanType,
  feature: FeatureKey,
): ForbiddenException {
  const requiredPlan = getRequiredPlanForFeature(orgType, feature)
  return new ForbiddenException({
    statusCode: 403,
    code: 'PLAN_REQUIRED',
    feature,
    requiredPlan: requiredPlan?.code ?? null,
    message: requiredPlan
      ? `Este recurso exige o plano ${requiredPlan.label} ou superior.`
      : 'Este recurso não está disponível para o plano atual da sua organização.',
  })
}

export function planMemberLimitException(limit: number, current: number): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: 'PLAN_LIMIT_MEMBERS',
    limit,
    current,
    message: `Limite de ${limit} ${limit === 1 ? 'membro' : 'membros'} do plano atual atingido (${current} em uso).`,
  })
}
