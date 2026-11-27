import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common'
import { OrgPermission, PoliticianStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { StorageService } from '../storage/storage.service'
import { PostsService } from '../posts/posts.service'
import { AdvocateReportDto } from '../posts/dto/advocate-report.dto'
import { PoliticiansRepository } from './politicians.repository'
import { CreatePoliticianDto } from './dto/create-politician.dto'
import { UpdatePoliticianDto } from './dto/update-politician.dto'
import { ListPoliticiansDto } from './dto/list-politicians.dto'
import { EventType, ReportStatus } from '@votz/shared-types'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { ReportLifecycleService } from '../report-lifecycle/report-lifecycle.service'
import { MandatometerService, MandatometerSnapshot } from '../report-lifecycle/mandatometer.service'

@Injectable()
export class PoliticiansService {
  constructor(
    private readonly repo: PoliticiansRepository,
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly storage: StorageService,
    private readonly lifecycle: ReportLifecycleService,
    private readonly mandatometerService: MandatometerService,
    @Optional() private readonly posts?: PostsService,
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
    const [politician, monthlyVolume, followersCount] = await Promise.all([
      this.repo.findById(id),
      this.repo.monthlyVolume(id),
      this.repo.countFollowers(id),
    ])
    if (!politician) throw new NotFoundException('Político não encontrado.')

    // Mandato encerrado mostra o retrato congelado no encerramento; ativo é calculado na hora.
    const frozen = politician.status === PoliticianStatus.ENCERRADO
      ? (politician.mandatometer as unknown as MandatometerSnapshot | null)
      : null
    const mandatometer = frozen?.commitments ? frozen : await this.mandatometerService.compute(id)
    const metrics = this.mandatometerService.metrics(mandatometer)

    return { ...politician, mandatometer, monthlyVolume, metrics, followersCount }
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
    if (dto.avatarUrl !== undefined) {
      this.storage.assertOwnStorageUrl(dto.avatarUrl, 'avatars', { allowExternalImageHosts: true })
    }
    if (dto.coverUrl !== undefined) {
      this.storage.assertOwnStorageUrl(dto.coverUrl, 'covers')
    }
    const data: Record<string, unknown> = { ...dto }
    if (dto.termStart) data.termStart = new Date(dto.termStart)
    if (dto.termEnd) data.termEnd = new Date(dto.termEnd)
    return this.repo.update(id, data)
  }

  async isFollowing(politicianId: string, userId: string) {
    const record = await this.prisma.userPoliticianFollower.findUnique({
      where: { userId_politicianId: { userId, politicianId } },
    })
    return { following: !!record }
  }

  async followToggle(politicianId: string, userId: string) {
    const existing = await this.prisma.userPoliticianFollower.findUnique({
      where: { userId_politicianId: { userId, politicianId } },
    })
    if (existing) {
      await this.prisma.userPoliticianFollower.delete({
        where: { userId_politicianId: { userId, politicianId } },
      })
      return { following: false }
    }
    await this.prisma.userPoliticianFollower.create({ data: { userId, politicianId } })
    return { following: true }
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

  /** Avocar: regra única em ReportLifecycleService (território, mandato ativo, clique duplo, avisos). */
  advocate(politicianId: string, reportId: string, user: ActingUser, dto?: AdvocateReportDto) {
    return this.lifecycle.advocate(reportId, user, { orgType: 'POLITICIAN', orgId: politicianId }, dto)
  }
}
