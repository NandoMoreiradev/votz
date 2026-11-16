import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { MembershipStatus, OrgPermission, OrgType, RecipientType } from '@prisma/client'
import {
  ANALYTICS_DEFINITION_DATE,
  ANALYTICS_DEFINITION_VERSION,
  ANALYTICS_TIMEZONE,
  MIN_CELL_SIZE,
  RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
  computePercentileFromBuckets,
  hasFeature,
  normalizeLocationKey,
} from '@votz/shared-types'
import { addDaysDateString, buildRatio, toSaoPauloDateString } from '../analytics/analytics.constants'
import { AnalyticsRepository } from '../analytics/analytics.repository'
import { planRequiredException } from '../auth/plan-errors'
import { PrismaService } from '../prisma/prisma.service'
import { PublicApiRepository } from './public-api.repository'
import { ListPublicReportsDto } from './dto/list-public-reports.dto'
import { ListPublicSurtosDto } from './dto/list-public-surtos.dto'
import { ListPublicEntitiesDto } from './dto/list-public-entities.dto'

const VALID_PERIODS = [7, 30, 90, 365] as const
type Period = (typeof VALID_PERIODS)[number]

@Injectable()
export class PublicApiService {
  constructor(
    private readonly repo: PublicApiRepository,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly analyticsRepo?: AnalyticsRepository,
  ) {}

  findReports(dto: ListPublicReportsDto) {
    return this.repo.findReports(dto)
  }

  async findReportById(id: string) {
    const report = await this.repo.findReportById(id)
    if (!report) throw new NotFoundException('Relato não encontrado')
    return report
  }

  findSurtos(dto: ListPublicSurtosDto) {
    return this.repo.findSurtos(dto)
  }

  getTendencias(rawDays: number) {
    const days = (VALID_PERIODS.includes(rawDays as Period) ? rawDays : 30) as Period
    return this.repo.getTendencias(days)
  }

  findEntities(dto: ListPublicEntitiesDto) {
    return this.repo.findEntities(dto)
  }

  async findEntityById(id: string) {
    const entity = await this.repo.findEntityById(id)
    if (!entity) throw new NotFoundException('Entidade não encontrada')
    return entity
  }

  private async resolveApiKeyEntity(
    apiKeyUserId: string,
    requiredPermission: OrgPermission,
    requestedEntityId?: string,
  ) {
    if (!this.prisma) {
      throw new ForbiddenException('Serviço de entidade indisponível')
    }
    const memberships = await this.prisma.orgMembership.findMany({
      where: {
        userId: apiKeyUserId,
        orgType: OrgType.ENTITY,
        status: MembershipStatus.ACTIVE,
        ...(requestedEntityId ? { orgId: requestedEntityId } : {}),
      },
      select: {
        orgId: true,
        role: { select: { permissions: true } },
      },
    })
    if (memberships.length === 0) {
      throw new ForbiddenException('API key não vinculada a uma entidade ativa')
    }
    if (!requestedEntityId && memberships.length > 1) {
      throw new BadRequestException(
        'Usuário possui vínculo ativo com mais de uma entidade; informe o parâmetro entityId.',
      )
    }

    const membership = memberships[0]
    const permissions = membership.role?.permissions ?? []
    if (!permissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        `Permissão ${requiredPermission} necessária para acessar este recurso da entidade.`,
      )
    }

    const entity = await this.prisma.entity.findUnique({
      where: { id: membership.orgId },
      select: { id: true, legalName: true, state: true, city: true, plan: true },
    })
    if (!entity) {
      throw new NotFoundException('Entidade não encontrada')
    }
    if (!hasFeature('ENTITY', entity.plan, 'api_access')) {
      throw planRequiredException('ENTITY', 'api_access')
    }
    return entity
  }

  async getMyEntityReports(apiKeyUserId: string, dto: ListPublicReportsDto, entityId?: string) {
    const entity = await this.resolveApiKeyEntity(
      apiKeyUserId,
      OrgPermission.EXPORT_DATA,
      entityId,
    )
    return this.repo.findReportsForEntity(entity.id, dto)
  }

  async getMyEntityAggregates(apiKeyUserId: string, rawDays = 30, entityId?: string) {
    const entity = await this.resolveApiKeyEntity(
      apiKeyUserId,
      OrgPermission.VIEW_ANALYTICS,
      entityId,
    )
    if (!this.analyticsRepo) {
      throw new ForbiddenException('Repositório analítico indisponível')
    }

    const days = (VALID_PERIODS.includes(rawDays as Period) ? rawDays : 30) as Period
    const todayStr = toSaoPauloDateString(new Date())
    const from = addDaysDateString(todayStr, -(days - 1))
    const matureCutoff = addDaysDateString(todayStr, -7)

    const filter = {
      recipientType: RecipientType.ENTITY,
      recipientId: entity.id,
      from,
      to: todayStr,
    }
    const [summary, byCategory] = await Promise.all([
      this.analyticsRepo.fetchDirectedSummary(filter, matureCutoff),
      this.analyticsRepo.fetchCategoryBreakdown('directed', null, filter, matureCutoff),
    ])

    const suppressed = summary.createdCount < MIN_CELL_SIZE
    const cityKey = entity.city ? normalizeLocationKey(entity.city) : null

    return {
      entity: {
        id: entity.id,
        legalName: entity.legalName,
        state: entity.state,
        city: entity.city,
        cityKey,
      },
      period: { from, to: todayStr, days },
      definitionVersion: ANALYTICS_DEFINITION_VERSION,
      definitionDate: ANALYTICS_DEFINITION_DATE,
      timezone: ANALYTICS_TIMEZONE,
      minCellSize: MIN_CELL_SIZE,
      suppressed,
      kpis: suppressed
        ? {
            volume: null,
            resolvedCount: null,
            openCount: null,
            responseRate: { value: null, numerator: 0, denominator: 0 },
            resolutionRate: { value: null, numerator: 0, denominator: 0 },
            slaComplianceRate: { value: null, numerator: 0, denominator: 0 },
            firstResponseMedianH: null,
          }
        : {
            volume: summary.createdCount,
            resolvedCount: summary.resolvedCount,
            openCount: summary.openCurrentCount,
            responseRate: buildRatio(summary.responseCount, summary.createdCount, 100),
            resolutionRate: buildRatio(
              summary.resolvedCount,
              summary.resolvedCount + summary.openOver7dCount,
              100,
            ),
            slaComplianceRate: buildRatio(
              summary.slaMetCount,
              summary.slaMetCount + summary.slaBreachedCount,
              100,
            ),
            firstResponseMedianH: computePercentileFromBuckets(
              summary.respBuckets,
              RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
              50,
            ),
          },
      byCategory: byCategory.map((row) => ({
        category: row.category,
        suppressed: row.createdCount < MIN_CELL_SIZE,
        createdCount: row.createdCount < MIN_CELL_SIZE ? null : row.createdCount,
        resolvedCount: row.createdCount < MIN_CELL_SIZE ? null : row.resolvedCount,
        slaMetCount: row.createdCount < MIN_CELL_SIZE ? null : row.slaMetCount,
        slaBreachedCount: row.createdCount < MIN_CELL_SIZE ? null : row.slaBreachedCount,
      })),
    }
  }
}
