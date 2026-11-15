import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { hasFeature, OrgPlanType } from '@votz/shared-types'
import { PrismaService } from '../../prisma/prisma.service'
import {
  ActingUser,
  MISSING_ORG_CONTEXT_MESSAGE,
  requireActingOrg,
  resolveOptionalActingOrg,
} from '../acting-org'
import {
  FEATURE_METADATA_KEY,
  RequiredFeatureMetadata,
} from '../decorators/requires-feature.decorator'
import { planRequiredException } from '../plan-errors'

const ALL_ORG_TYPES: readonly OrgPlanType[] = ['ENTITY', 'POLITICIAN', 'COMPANY']

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<RequiredFeatureMetadata | undefined>(
      FEATURE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!meta) return true

    const req = context.switchToHttp().getRequest<{
      params?: { id?: string }
      user?: ActingUser
    }>()
    const allowedTypes = meta.orgType ? [meta.orgType] : ALL_ORG_TYPES
    const expectedOrgId = req.params?.id

    const acting = meta.permission
      ? await requireActingOrg(
          this.prisma,
          req.user,
          allowedTypes,
          meta.permission,
          expectedOrgId ? { expectedOrgId } : undefined,
        )
      : await resolveOptionalActingOrg(this.prisma, req.user, allowedTypes)

    if (!acting) {
      throw new ForbiddenException(MISSING_ORG_CONTEXT_MESSAGE)
    }

    if (!meta.permission && expectedOrgId && acting.orgId !== expectedOrgId) {
      throw new ForbiddenException('Contexto ativo não corresponde à organização solicitada.')
    }

    const plan = await this.findOrgPlan(acting.orgType, acting.orgId)
    if (!plan) {
      throw new ForbiddenException('Organização ativa não encontrada.')
    }

    if (!hasFeature(acting.orgType, plan, meta.feature)) {
      throw planRequiredException(acting.orgType, meta.feature)
    }

    return true
  }

  private async findOrgPlan(orgType: OrgPlanType, orgId: string): Promise<string | null> {
    if (orgType === 'ENTITY') {
      const entity = await this.prisma.entity.findUnique({
        where: { id: orgId },
        select: { plan: true },
      })
      return entity?.plan ?? null
    }
    if (orgType === 'POLITICIAN') {
      const politician = await this.prisma.politician.findUnique({
        where: { id: orgId },
        select: { plan: true },
      })
      return politician?.plan ?? null
    }
    if (orgType === 'COMPANY') {
      const company = await this.prisma.company.findUnique({
        where: { id: orgId },
        select: { plan: true },
      })
      return company?.plan ?? null
    }
    return null
  }
}
