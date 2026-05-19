import { Injectable, NotFoundException } from '@nestjs/common'
import { PublicApiRepository } from './public-api.repository'
import { ListPublicReportsDto } from './dto/list-public-reports.dto'
import { ListPublicSurtosDto } from './dto/list-public-surtos.dto'
import { ListPublicEntitiesDto } from './dto/list-public-entities.dto'

const VALID_PERIODS = [7, 30, 90, 365] as const
type Period = (typeof VALID_PERIODS)[number]

@Injectable()
export class PublicApiService {
  constructor(private readonly repo: PublicApiRepository) {}

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
}
