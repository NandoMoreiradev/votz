import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common'
import { OrgPermission } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { PostsService } from '../posts/posts.service'
import { AdvocateReportDto } from '../posts/dto/advocate-report.dto'
import { EntitiesRepository } from './entities.repository'
import { CreateEntityDto } from './dto/create-entity.dto'
import { UpdateEntityDto } from './dto/update-entity.dto'
import { ListEntitiesDto } from './dto/list-entities.dto'
import { EventType, ReportStatus, hasFeature } from '@votz/shared-types'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { planRequiredException } from '../auth/plan-errors'

import { ReportLifecycleService } from '../report-lifecycle/report-lifecycle.service'
@Injectable()
export class EntitiesService {
  constructor(
    private readonly repo: EntitiesRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly lifecycle: ReportLifecycleService,
    @Optional() private readonly posts?: PostsService,
  ) {}

  async register(userId: string, dto: CreateEntityDto) {
    const cnpj = dto.cnpj.replace(/\D/g, '')
    return this.repo.create(userId, { ...dto, cnpj })
  }

  findCities(state?: string) {
    return this.repo.findCities(state)
  }

  async findAll(query: ListEntitiesDto) {
    return this.repo.findAll({
      type: query.type,
      city: query.city,
      state: query.state,
      search: query.search,
      verified: query.verified,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    })
  }

  async findById(id: string) {
    const [entity, stats, monthlyVolume, followersCount] = await Promise.all([
      this.repo.findByIdFull(id),
      this.repo.stats(id),
      this.repo.monthlyVolume(id),
      this.repo.countFollowers(id),
    ])
    if (!entity) throw new NotFoundException('Entity not found')

    const { total, resolved, byStatus } = stats
    const open = byStatus[ReportStatus.OPEN] ?? 0
    const disputed = byStatus[ReportStatus.DISPUTED] ?? 0

    const responseRate = total > 0 ? Math.round(((total - open) / total) * 100) : 0
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0
    const contestationRate = (resolved + disputed) > 0
      ? Math.round((disputed / (resolved + disputed)) * 100) : 0
    const trustBadge = responseRate >= 70 && resolutionRate >= 50

    const classification =
      responseRate >= 80 && resolutionRate >= 60 ? 'Entidade Comprometida' :
      responseRate >= 60 ? 'Entidade Regular' :
      responseRate >= 30 ? 'Entidade Omissa' : 'Entidade em Alerta'

    const metrics = { responseRate, resolutionRate, contestationRate, trustBadge, classification }

    return { ...entity, stats, monthlyVolume, metrics, followersCount }
  }

  async findReports(entityId: string, page: number, limit: number, status?: string, from?: string) {
    const entity = await this.repo.findByIdFull(entityId)
    if (!entity) throw new NotFoundException('Entity not found')
    return this.repo.findReports(entityId, page, limit, status, from ? new Date(from) : undefined)
  }

  async update(id: string, userId: string, dto: UpdateEntityDto) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { userId, orgType: 'ENTITY', orgId: id, status: 'ACTIVE' },
      select: { role: { select: { permissions: true } } },
    })
    if (!membership || !membership.role.permissions.includes(OrgPermission.MANAGE_PROFILE)) {
      throw new ForbiddenException()
    }
    if (dto.logoUrl !== undefined) {
      this.storage.assertOwnStorageUrl(dto.logoUrl, 'entities')
    }
    if (dto.coverUrl !== undefined) {
      this.storage.assertOwnStorageUrl(dto.coverUrl, 'covers')
    }
    if (
      dto.slaHours !== undefined ||
      dto.resolutionSlaHours !== undefined ||
      dto.slaEscalationHours !== undefined ||
      dto.autoMonthlyReportEnabled !== undefined
    ) {
      const entity = await this.repo.findByIdFull(id)
      if (!entity) throw new NotFoundException('Entity not found')
      if (!hasFeature('ENTITY', entity.plan, 'sla_panel')) {
        throw planRequiredException('ENTITY', 'sla_panel')
      }
    }
    return this.repo.update(id, dto as object)
  }

  /** Avocar: regra única em ReportLifecycleService. */
  advocate(entityId: string, reportId: string, user: ActingUser, dto?: AdvocateReportDto) {
    return this.lifecycle.advocate(reportId, user, { orgType: 'ENTITY', orgId: entityId }, dto)
  }

  async followToggle(entityId: string, userId: string) {
    const existing = await this.prisma.userEntityFollower.findUnique({
      where: { userId_entityId: { userId, entityId } },
    })
    if (existing) {
      await this.prisma.userEntityFollower.delete({ where: { id: existing.id } })
      return { following: false }
    }
    await this.prisma.userEntityFollower.create({ data: { userId, entityId } })
    return { following: true }
  }

  async isFollowing(entityId: string, userId: string) {
    const existing = await this.prisma.userEntityFollower.findUnique({
      where: { userId_entityId: { userId, entityId } },
    })
    return { following: !!existing }
  }
}
