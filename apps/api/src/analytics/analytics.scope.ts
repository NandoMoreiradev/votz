import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { OrgPermission, RecipientType } from '@prisma/client'
import {
  OrgPlanType,
  getPlanConfig,
  getPoliticianTier,
  normalizeLocationKey,
} from '@votz/shared-types'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { planRequiredException } from '../auth/plan-errors'
import { PrismaService } from '../prisma/prisma.service'
import {
  addDaysDateString,
  diffDaysBetweenStrings,
  resolveMaxRangeDays,
  toSaoPauloDateString,
} from './analytics.constants'
import {
  AnalyticsScopeMode,
  BaseAnalyticsFilterDto,
  PeriodPreset,
} from './dto/analytics-query.dto'

export interface ResolvedTerritorialScope {
  orgType: 'ENTITY' | 'POLITICIAN'
  orgId: string
  orgName: string
  plan: string
  scopeMode: AnalyticsScopeMode
  /** 'CITY' | 'STATE' */
  territoryLevel: 'CITY' | 'STATE'
  state: string
  cityKey: string | null
  historyDays: number | null
  from: string
  to: string
  cellFilter: string | null
  recipientType: RecipientType
}

@Injectable()
export class AnalyticsScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOrgScope(
    user: ActingUser,
    query: BaseAnalyticsFilterDto,
    options?: { forceTerritory?: boolean },
  ): Promise<ResolvedTerritorialScope> {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['ENTITY', 'POLITICIAN'],
      OrgPermission.VIEW_ANALYTICS,
    )

    const orgType = acting.orgType as 'ENTITY' | 'POLITICIAN'
    const scopeMode = options?.forceTerritory
      ? AnalyticsScopeMode.AREA
      : (query.scope ?? AnalyticsScopeMode.AREA)

    let orgName = ''
    let plan = 'BASICO'
    let territoryLevel: 'CITY' | 'STATE' = 'CITY'
    let orgState = ''
    let orgCityKey: string | null = null

    if (orgType === 'ENTITY') {
      const entity = await this.prisma.entity.findUnique({
        where: { id: acting.orgId },
        select: { legalName: true, plan: true, state: true, city: true },
      })
      if (!entity) {
        throw new ForbiddenException('Entidade ativa não encontrada.')
      }
      orgName = entity.legalName
      plan = entity.plan
      orgState = (entity.state ?? '').trim().toUpperCase()
      const normalizedCity = normalizeLocationKey(entity.city)
      if (normalizedCity) {
        territoryLevel = 'CITY'
        orgCityKey = normalizedCity
      } else {
        territoryLevel = 'STATE'
        orgCityKey = null
      }
      if (!orgState) {
        throw new ForbiddenException('Entidade sem UF cadastrada para delimitar área.')
      }
    } else {
      const politician = await this.prisma.politician.findUnique({
        where: { id: acting.orgId },
        select: { name: true, plan: true, office: true, state: true, city: true },
      })
      if (!politician) {
        throw new ForbiddenException('Perfil de político ativo não encontrado.')
      }
      orgName = politician.name
      plan = politician.plan
      orgState = (politician.state ?? '').trim().toUpperCase()
      const tier = getPoliticianTier(politician.office)
      const normalizedOffice = normalizeLocationKey(politician.office)
      const isMunicipal =
        normalizedOffice === 'vereador' ||
        normalizedOffice === 'vereadora' ||
        normalizedOffice === 'prefeito' ||
        normalizedOffice === 'prefeita' ||
        normalizedOffice === 'vice prefeito' ||
        normalizedOffice === 'vice prefeita' ||
        tier <= 2

      if (isMunicipal) {
        const normalizedCity = normalizeLocationKey(politician.city)
        if (!normalizedCity || !orgState) {
          throw new ForbiddenException(
            'Mandato municipal sem cidade/UF cadastrada para delimitar área.',
          )
        }
        territoryLevel = 'CITY'
        orgCityKey = normalizedCity
      } else {
        if (!orgState) {
          throw new ForbiddenException('Mandato sem UF cadastrada para delimitar área.')
        }
        territoryLevel = 'STATE'
        orgCityKey = null
      }
    }

    // Valida parâmetros territoriais informados pelo cliente contra o escopo da org
    if (query.state && query.state !== orgState) {
      throw new ForbiddenException('UF solicitada está fora da área desta organização.')
    }

    let effectiveCityKey = orgCityKey
    if (query.cityKey) {
      if (territoryLevel === 'CITY' && query.cityKey !== orgCityKey) {
        throw new ForbiddenException('Município solicitado está fora da área desta organização.')
      }
      effectiveCityKey = query.cityKey
    }

    if (query.cell) {
      await this.assertCellInArea(query.cell, orgState, territoryLevel === 'CITY' ? orgCityKey : effectiveCityKey)
    }

    const planConfig = getPlanConfig(orgType as OrgPlanType, plan)
    const historyDays = planConfig?.limits.historyDays ?? null

    const { from, to } = this.resolveDateWindow(query, historyDays, orgType)

    return {
      orgType,
      orgId: acting.orgId,
      orgName,
      plan,
      scopeMode,
      territoryLevel,
      state: orgState,
      cityKey: effectiveCityKey,
      historyDays,
      from,
      to,
      cellFilter: query.cell ?? null,
      recipientType: orgType === 'ENTITY' ? RecipientType.ENTITY : RecipientType.POLITICIAN,
    }
  }

  private async assertCellInArea(
    cell7: string,
    state: string,
    cityKey: string | null,
  ): Promise<void> {
    const match = await this.prisma.areaMetricDaily.findFirst({
      where: {
        cell7,
        state,
        ...(cityKey ? { cityKey } : {}),
      },
      select: { id: true },
    })
    if (!match) {
      throw new ForbiddenException('Célula solicitada não pertence à área desta organização.')
    }
  }

  resolveDateWindow(
    query: BaseAnalyticsFilterDto,
    historyDays: number | null,
    orgType: OrgPlanType,
  ): { from: string; to: string } {
    const today = toSaoPauloDateString(new Date())
    let to = query.to ?? today
    if (to > today) to = today

    const presetDays =
      query.period === PeriodPreset.D7
        ? 7
        : query.period === PeriodPreset.D30
          ? 30
          : query.period === PeriodPreset.D90
            ? 90
            : query.period === PeriodPreset.D365
              ? 365
              : historyDays ?? 30

    let from = query.from ?? addDaysDateString(to, -(presetDays - 1))

    if (from > to) {
      throw new BadRequestException('Data inicial (from) não pode ser maior que data final (to).')
    }

    const spanDays = diffDaysBetweenStrings(from, to) + 1
    if (spanDays > resolveMaxRangeDays()) {
      throw new BadRequestException('Intervalo máximo permitido é de 24 meses.')
    }

    if (historyDays !== null) {
      const oldestAllowed = addDaysDateString(today, -(historyDays - 1))
      if (from < oldestAllowed) {
        throw planRequiredException(orgType, 'analytics_full')
      }
    }

    return { from, to }
  }
}
