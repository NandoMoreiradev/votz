import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common'
import { EntitiesRepository } from './entities.repository'
import { CreateEntityDto } from './dto/create-entity.dto'
import { UpdateEntityDto } from './dto/update-entity.dto'
import { ListEntitiesDto } from './dto/list-entities.dto'

@Injectable()
export class EntitiesService {
  constructor(private readonly repo: EntitiesRepository) {}

  async register(userId: string, dto: CreateEntityDto) {
    const existing = await this.repo.findByUserId(userId)
    if (existing) throw new ConflictException('User already has a registered entity')

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

  async findReports(entityId: string, page: number, limit: number) {
    const entity = await this.repo.findByIdFull(entityId)
    if (!entity) throw new NotFoundException('Entity not found')
    return this.repo.findReports(entityId, page, limit)
  }

  async update(id: string, userId: string, dto: UpdateEntityDto) {
    const entity = await this.repo.findByUserId(userId)
    if (!entity || entity.id !== id) throw new ForbiddenException()
    return this.repo.update(id, dto as object)
  }
}
