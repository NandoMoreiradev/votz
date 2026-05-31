import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CompanyPlan, EntityPlan, OrgType, PoliticianPlan } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { PLAN_KEY } from '../decorators/requires-plan.decorator'

const ENTITY_LEVELS: Record<EntityPlan, number> = {
  BASICO: 0,
  GESTAO: 1,
  PRO: 2,
  ENTERPRISE: 3,
}

const POLITICIAN_LEVELS: Record<PoliticianPlan, number> = {
  BASICO: 0,
  MANDATOMETRO_PRO: 1,
  CAMPANHA: 2,
}

const COMPANY_LEVELS: Record<CompanyPlan, number> = {
  STARTER: 0,
  BUSINESS: 1,
  ENTERPRISE: 2,
  WHITE_LABEL: 3,
}

function planSatisfies(current: string, required: string, orgType: OrgType): boolean {
  switch (orgType) {
    case OrgType.ENTITY:
      return (ENTITY_LEVELS[current as EntityPlan] ?? -1) >= (ENTITY_LEVELS[required as EntityPlan] ?? 0)
    case OrgType.POLITICIAN:
      return (POLITICIAN_LEVELS[current as PoliticianPlan] ?? -1) >= (POLITICIAN_LEVELS[required as PoliticianPlan] ?? 0)
    case OrgType.COMPANY:
      return (COMPANY_LEVELS[current as CompanyPlan] ?? -1) >= (COMPANY_LEVELS[required as CompanyPlan] ?? 0)
    default:
      return false
  }
}

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<{ plan: string; orgType: OrgType }>(PLAN_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required) return true

    const request = context.switchToHttp().getRequest()
    const userId: string | undefined = request.user?.id
    if (!userId) return false

    const orgId: string | undefined = request.params.id
    if (!orgId) return false

    const membership = await this.prisma.orgMembership.findFirst({
      where: { userId, orgType: required.orgType, orgId, status: 'ACTIVE' },
    })
    if (!membership) throw new ForbiddenException('Plano insuficiente')

    let currentPlan: string | null = null
    if (required.orgType === OrgType.ENTITY) {
      const entity = await this.prisma.entity.findUnique({ where: { id: orgId }, select: { plan: true } })
      currentPlan = entity?.plan ?? null
    } else if (required.orgType === OrgType.POLITICIAN) {
      const politician = await this.prisma.politician.findUnique({ where: { id: orgId }, select: { plan: true } })
      currentPlan = politician?.plan ?? null
    } else if (required.orgType === OrgType.COMPANY) {
      const company = await this.prisma.company.findUnique({ where: { id: orgId }, select: { plan: true } })
      currentPlan = company?.plan ?? null
    }

    if (!currentPlan || !planSatisfies(currentPlan, required.plan, required.orgType))
      throw new ForbiddenException('Plano insuficiente')

    return true
  }
}
