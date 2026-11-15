import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { MembershipStatus, OrgType } from '@prisma/client'
import {
  OrgPlanType,
  PoliticianPriceTier,
  getMaxMembers,
  getPlanConfig,
  getPoliticianTier,
} from '@votz/shared-types'
import {
  ActingUser,
  MISSING_ORG_CONTEXT_MESSAGE,
  resolveOptionalActingOrg,
} from '../auth/acting-org'
import { PrismaService } from '../prisma/prisma.service'

export interface CurrentPlanSummary {
  orgType: OrgPlanType
  orgId: string
  orgName: string
  plan: string
  label: string
  description: string
  tier: PoliticianPriceTier | null
  limits: {
    maxMembers: number | null
    historyDays: number | null
  }
  members: {
    active: number
    pending: number
    used: number
    max: number | null
  }
  features: Record<string, boolean>
  featureStatus: Record<string, 'available' | 'soon'>
}

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getMyPlan(user: ActingUser | undefined | null): Promise<CurrentPlanSummary> {
    const acting = await resolveOptionalActingOrg(this.prisma, user, [
      'ENTITY',
      'POLITICIAN',
      'COMPANY',
    ])
    if (!acting) {
      throw new ForbiddenException(MISSING_ORG_CONTEXT_MESSAGE)
    }

    const org = await this.loadOrg(acting.orgType, acting.orgId)
    if (!org) {
      throw new NotFoundException('Organização ativa não encontrada.')
    }

    const tier =
      acting.orgType === 'POLITICIAN'
        ? getPoliticianTier(org.office, this.logger)
        : null

    const config = getPlanConfig(acting.orgType, org.plan)
    const maxMembers = getMaxMembers(acting.orgType, org.plan, tier ?? undefined)

    const [active, pending] = await Promise.all([
      this.prisma.orgMembership.count({
        where: {
          orgType: acting.orgType as OrgType,
          orgId: acting.orgId,
          status: MembershipStatus.ACTIVE,
        },
      }),
      this.prisma.memberInvite.count({
        where: {
          orgType: acting.orgType as OrgType,
          orgId: acting.orgId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ])

    return {
      orgType: acting.orgType,
      orgId: acting.orgId,
      orgName: org.name,
      plan: org.plan,
      label: config?.label ?? org.plan,
      description: config?.description ?? '',
      tier,
      limits: {
        maxMembers,
        historyDays: config?.limits.historyDays ?? null,
      },
      members: {
        active,
        pending,
        used: active + pending,
        max: maxMembers,
      },
      features: config?.features ?? {},
      featureStatus: config?.status ?? {},
    }
  }

  private async loadOrg(
    orgType: OrgPlanType,
    orgId: string,
  ): Promise<{ name: string; plan: string; office?: string } | null> {
    if (orgType === 'ENTITY') {
      const entity = await this.prisma.entity.findUnique({
        where: { id: orgId },
        select: { legalName: true, plan: true },
      })
      return entity ? { name: entity.legalName, plan: entity.plan } : null
    }

    if (orgType === 'POLITICIAN') {
      const politician = await this.prisma.politician.findUnique({
        where: { id: orgId },
        select: { name: true, plan: true, office: true },
      })
      return politician
        ? { name: politician.name, plan: politician.plan, office: politician.office }
        : null
    }

    const company = await this.prisma.company.findUnique({
      where: { id: orgId },
      select: { tradeName: true, plan: true },
    })
    return company ? { name: company.tradeName, plan: company.plan } : null
  }
}
