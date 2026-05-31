import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { OrgPermission } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EntitiesRepository } from './entities.repository'
import { CreateEntityDto } from './dto/create-entity.dto'
import { UpdateEntityDto } from './dto/update-entity.dto'
import { ListEntitiesDto } from './dto/list-entities.dto'
import { EventType, ReportStatus } from '@votz/shared-types'

@Injectable()
export class EntitiesService {
  constructor(
    private readonly repo: EntitiesRepository,
    private readonly prisma: PrismaService,
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
    const [entity, stats, monthlyVolume] = await Promise.all([
      this.repo.findByIdFull(id),
      this.repo.stats(id),
      this.repo.monthlyVolume(id),
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

    return { ...entity, stats, monthlyVolume, metrics }
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
    return this.repo.update(id, dto as object)
  }

  async advocate(entityId: string, reportId: string, userId: string) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { userId, orgType: 'ENTITY', orgId: entityId, status: 'ACTIVE' },
    })
    if (!membership) throw new ForbiddenException()

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        status: true,
        timeline: {
          where: { type: EventType.RESPONDED },
          select: { metadata: true },
        },
      },
    })
    if (!report) throw new NotFoundException('Report not found')

    const ADVOCATABLE = [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW, ReportStatus.IN_PROGRESS]
    if (!ADVOCATABLE.includes(report.status as ReportStatus)) {
      throw new BadRequestException('Report cannot be advocated at this stage')
    }

    const alreadyAdvocated = report.timeline.some(
      (e) =>
        (e.metadata as Record<string, unknown>)?.action === 'advocated' &&
        (e.metadata as Record<string, unknown>)?.entityId === entityId,
    )
    if (alreadyAdvocated) throw new ConflictException('Esta entidade já avocou este relato')

    const isFirstAdvocacy = !report.timeline.some(
      (e) => (e.metadata as Record<string, unknown>)?.action === 'advocated',
    )

    if (isFirstAdvocacy && report.status !== ReportStatus.IN_PROGRESS) {
      await this.prisma.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.IN_PROGRESS },
      })
    }

    await this.prisma.timelineEvent.create({
      data: {
        reportId,
        type: EventType.RESPONDED,
        content: 'Entidade avocou este relato e assumiu o compromisso de acompanhá-lo.',
        authorId: userId,
        metadata: { action: 'advocated', entityId },
      },
    })

    return { advocated: true }
  }
}
