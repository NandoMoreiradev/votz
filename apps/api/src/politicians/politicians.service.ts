import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { OrgPermission, PoliticianStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { PoliticiansRepository } from './politicians.repository'
import { CreatePoliticianDto } from './dto/create-politician.dto'
import { UpdatePoliticianDto } from './dto/update-politician.dto'
import { ListPoliticiansDto } from './dto/list-politicians.dto'
import { EventType, ReportStatus } from '@votz/shared-types'

@Injectable()
export class PoliticiansService {
  constructor(
    private readonly repo: PoliticiansRepository,
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
  ) {}

  async register(userId: string, dto: CreatePoliticianDto) {
    return this.repo.create(userId, {
      ...dto,
      termStart: new Date(dto.termStart),
      termEnd: new Date(dto.termEnd),
    })
  }

  findCities(state?: string) {
    return this.repo.findCities(state)
  }

  async findAll(query: ListPoliticiansDto) {
    return this.repo.findAll({
      state: query.state,
      city: query.city,
      party: query.party,
      office: query.office,
      search: query.search,
      verified: query.verified,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    })
  }

  async findById(id: string) {
    const [politician, mandatometer, monthlyVolume] = await Promise.all([
      this.repo.findById(id),
      this.repo.mandatometerStats(id),
      this.repo.monthlyVolume(id),
    ])
    if (!politician) throw new NotFoundException('Politician not found')

    const { total, resolved, open } = mandatometer
    const disputed = mandatometer.byStatus['DISPUTED'] ?? 0

    const responseRate = total > 0 ? Math.round(((total - open) / total) * 100) : 0
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0
    const contestationRate = (resolved + disputed) > 0
      ? Math.round((disputed / (resolved + disputed)) * 100) : 0
    const trustBadge = responseRate >= 60 && resolutionRate >= 50

    const classification =
      resolutionRate >= 60 ? 'Político Ativo' :
      resolutionRate >= 30 ? 'Político Regular' : 'Político Inativo'

    const metrics = { responseRate, resolutionRate, contestationRate, trustBadge, classification }

    return { ...politician, mandatometer, monthlyVolume, metrics }
  }

  async findReports(politicianId: string, page: number, limit: number, status?: string, from?: string) {
    const p = await this.repo.findById(politicianId)
    if (!p) throw new NotFoundException('Politician not found')
    return this.repo.findReports(politicianId, page, limit, status, from ? new Date(from) : undefined)
  }

  async update(id: string, userId: string, dto: UpdatePoliticianDto) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { userId, orgType: 'POLITICIAN', orgId: id, status: 'ACTIVE' },
      select: { role: { select: { permissions: true } } },
    })
    if (!membership || !membership.role.permissions.includes(OrgPermission.MANAGE_PROFILE)) {
      throw new ForbiddenException()
    }
    const data: Record<string, unknown> = { ...dto }
    if (dto.termStart) data.termStart = new Date(dto.termStart)
    if (dto.termEnd) data.termEnd = new Date(dto.termEnd)
    return this.repo.update(id, data)
  }

  private async assertPoliticianAtivo(politicianId: string): Promise<void> {
    const p = await this.prisma.politician.findUnique({
      where: { id: politicianId },
      select: { status: true },
    })
    if (!p) throw new NotFoundException('Politician not found')
    if (p.status !== PoliticianStatus.ATIVO) {
      throw new ForbiddenException('Este político não possui mandato ativo')
    }
  }

  async advocate(politicianId: string, reportId: string, userId: string) {
    await this.assertPoliticianAtivo(politicianId)

    const membership = await this.prisma.orgMembership.findFirst({
      where: { userId, orgType: 'POLITICIAN', orgId: politicianId, status: 'ACTIVE' },
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
        (e.metadata as Record<string, unknown>)?.politicianId === politicianId,
    )
    if (alreadyAdvocated) throw new ConflictException('Você já avocou este relato')

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
        content: 'Político avocou este relato e assumiu o compromisso de acompanhá-lo.',
        authorId: userId,
        metadata: { action: 'advocated', politicianId },
      },
    })

    const stats = await this.repo.mandatometerStats(politicianId)
    await this.repo.updateMandatometer(politicianId, stats)

    return { advocated: true }
  }
}
