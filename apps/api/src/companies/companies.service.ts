import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { CompaniesRepository } from './companies.repository'
import { StorageService } from '../storage/storage.service'
import { ListCompaniesDto } from './dto/list-companies.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'

@Injectable()
export class CompaniesService {
  constructor(
    private readonly repo: CompaniesRepository,
    private readonly storage: StorageService,
  ) {}

  async findAll(query: ListCompaniesDto) {
    return this.repo.findAll({
      sector: query.sector,
      city: query.city,
      state: query.state,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    })
  }

  async findById(id: string) {
    const [company, stats, followersCount] = await Promise.all([
      this.repo.findById(id),
      this.repo.stats(id),
      this.repo.countFollowers(id),
    ])
    if (!company) throw new NotFoundException('Company not found')
    return { ...company, stats, followersCount }
  }

  async findReports(companyId: string, page: number, limit: number, status?: string) {
    const company = await this.repo.findById(companyId)
    if (!company) throw new NotFoundException('Company not found')
    return this.repo.findReports(companyId, page, limit, status)
  }

  async update(id: string, userId: string, dto: UpdateCompanyDto) {
    const company = await this.repo.findById(id)
    if (!company) throw new NotFoundException('Company not found')

    const hasPerm = await this.repo.hasMemberWithPermission(userId, id, 'MANAGE_PROFILE')
    if (!hasPerm) throw new ForbiddenException('Permissão insuficiente')

    if (dto.logoUrl !== undefined) {
      this.storage.assertOwnStorageUrl(dto.logoUrl, 'entities')
    }

    if (dto.coverUrl !== undefined) {
      this.storage.assertOwnStorageUrl(dto.coverUrl, 'covers')
    }

    return this.repo.update(id, dto)
  }

  async followToggle(companyId: string, userId: string) {
    const company = await this.repo.findById(companyId)
    if (!company) throw new NotFoundException('Company not found')
    const existing = await this.repo.findFollow(userId, companyId)
    if (existing) {
      await this.repo.deleteFollow(existing.id)
      return { following: false }
    }
    await this.repo.createFollow(userId, companyId)
    return { following: true }
  }

  async isFollowing(companyId: string, userId: string) {
    const existing = await this.repo.findFollow(userId, companyId)
    return { following: !!existing }
  }
}
