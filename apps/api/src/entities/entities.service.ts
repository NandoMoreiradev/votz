import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { OrgPermission } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EntitiesRepository } from './entities.repository'
import { CreateEntityDto } from './dto/create-entity.dto'
import { UpdateEntityDto } from './dto/update-entity.dto'
import { ListEntitiesDto } from './dto/list-entities.dto'

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

  async findAll(query: ListEntitiesDto) {
    return this.repo.findAll({
      type: query.type,
      city: query.city,
      state: query.state,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    })
  }

  async findById(id: string) {
    const [entity, stats] = await Promise.all([
      this.repo.findByIdFull(id),
      this.repo.stats(id),
    ])
    if (!entity) throw new NotFoundException('Entity not found')
    return { ...entity, stats }
  }

  async findReports(entityId: string, page: number, limit: number, status?: string) {
    const entity = await this.repo.findByIdFull(entityId)
    if (!entity) throw new NotFoundException('Entity not found')
    return this.repo.findReports(entityId, page, limit, status)
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
}
