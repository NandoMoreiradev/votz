import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { CompaniesRepository } from './companies.repository'
import { ListCompaniesDto } from './dto/list-companies.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'

@Injectable()
export class CompaniesService {
  constructor(private readonly repo: CompaniesRepository) {}

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
    const [company, stats] = await Promise.all([
      this.repo.findById(id),
      this.repo.stats(id),
    ])
    if (!company) throw new NotFoundException('Company not found')
    return { ...company, stats }
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

    return this.repo.update(id, dto)
  }
}
