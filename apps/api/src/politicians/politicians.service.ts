import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { OrgPermission } from '@prisma/client'
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

  async findAll(query: ListPoliticiansDto) {
    return this.repo.findAll({
      state: query.state,
      city: query.city,
      party: query.party,
      office: query.office,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    })
  }

  async findById(id: string) {
    const [politician, mandatometer] = await Promise.all([
      this.repo.findById(id),
      this.repo.mandatometerStats(id),
    ])
    if (!politician) throw new NotFoundException('Politician not found')
    return { ...politician, mandatometer }
  }

  async findReports(politicianId: string, page: number, limit: number, status?: string) {
    const p = await this.repo.findById(politicianId)
    if (!p) throw new NotFoundException('Politician not found')
    return this.repo.findReports(politicianId, page, limit, status)
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

  async advocate(politicianId: string, reportId: string, userId: string) {
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
