import { CompanyPlan, EntityPlan, PoliticianPlan, UserType } from '@prisma/client'
import { AdminService } from './admin.service'

describe('AdminService', () => {
  let service: AdminService
  let repo: any

  beforeEach(() => {
    repo = {
      stats: jest.fn(),
      listUsers: jest.fn(),
      setBan: jest.fn(),
      setUserType: jest.fn(),
      listReports: jest.fn(),
      deleteReport: jest.fn(),
      listEntities: jest.fn(),
      setEntityVerified: jest.fn(),
      listPoliticians: jest.fn(),
      setPoliticianVerified: jest.fn(),
      setEntityPlan: jest.fn(),
      setPoliticianPlan: jest.fn(),
      setCompanyPlan: jest.fn(),
    }
    service = new AdminService(repo)
  })

  it('delegates stats and clamps pagination limit to 50', async () => {
    repo.stats.mockResolvedValue({ users: 10 })
    await expect(service.stats()).resolves.toEqual({ users: 10 })

    repo.listUsers.mockResolvedValue({ data: [], total: 0 })
    await service.listUsers('ana', 2, 200)
    expect(repo.listUsers).toHaveBeenCalledWith({ search: 'ana', page: 2, limit: 50 })

    repo.listReports.mockResolvedValue({ data: [], total: 0 })
    await service.listReports('buraco', 1, 100)
    expect(repo.listReports).toHaveBeenCalledWith({ search: 'buraco', page: 1, limit: 50 })
  })

  it('delegates moderation and plan mutations', async () => {
    await service.banUser('u1', true)
    expect(repo.setBan).toHaveBeenCalledWith('u1', true)

    await service.setUserType('u1', UserType.MODERATOR)
    expect(repo.setUserType).toHaveBeenCalledWith('u1', UserType.MODERATOR)

    await service.deleteReport('rep-1')
    expect(repo.deleteReport).toHaveBeenCalledWith('rep-1')

    await service.verifyEntity('e1', true)
    expect(repo.setEntityVerified).toHaveBeenCalledWith('e1', true)

    await service.verifyPolitician('p1', true)
    expect(repo.setPoliticianVerified).toHaveBeenCalledWith('p1', true)

    await service.setEntityPlan('e1', EntityPlan.GESTAO)
    expect(repo.setEntityPlan).toHaveBeenCalledWith('e1', EntityPlan.GESTAO)

    await service.setPoliticianPlan('p1', PoliticianPlan.MANDATOMETRO_PRO)
    expect(repo.setPoliticianPlan).toHaveBeenCalledWith('p1', PoliticianPlan.MANDATOMETRO_PRO)

    await service.setCompanyPlan('c1', CompanyPlan.BUSINESS)
    expect(repo.setCompanyPlan).toHaveBeenCalledWith('c1', CompanyPlan.BUSINESS)
  })
})
