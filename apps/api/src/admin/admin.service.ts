import { Injectable, NotFoundException } from '@nestjs/common'
import { AdminRepository } from './admin.repository'

@Injectable()
export class AdminService {
  constructor(private readonly repo: AdminRepository) {}

  stats() { return this.repo.stats() }

  listUsers(search?: string, page = 1, limit = 20) {
    return this.repo.listUsers({ search, page, limit: Math.min(limit, 50) })
  }

  async banUser(id: string, banned: boolean) {
    return this.repo.setBan(id, banned)
  }

  async setUserType(id: string, type: string) {
    return this.repo.setUserType(id, type)
  }

  listReports(search?: string, page = 1, limit = 20) {
    return this.repo.listReports({ search, page, limit: Math.min(limit, 50) })
  }

  async deleteReport(id: string) {
    return this.repo.deleteReport(id)
  }

  listEntities(verified?: boolean, page = 1, limit = 20) {
    return this.repo.listEntities({ verified, page, limit: Math.min(limit, 50) })
  }

  async verifyEntity(id: string, verified: boolean) {
    return this.repo.setEntityVerified(id, verified)
  }

  listPoliticians(verified?: boolean, page = 1, limit = 20) {
    return this.repo.listPoliticians({ verified, page, limit: Math.min(limit, 50) })
  }

  async verifyPolitician(id: string, verified: boolean) {
    return this.repo.setPoliticianVerified(id, verified)
  }

  async setEntityPlan(id: string, plan: string) {
    return this.repo.setEntityPlan(id, plan)
  }

  async setPoliticianPlan(id: string, plan: string) {
    return this.repo.setPoliticianPlan(id, plan)
  }

  async setCompanyPlan(id: string, plan: string) {
    return this.repo.setCompanyPlan(id, plan)
  }
}
