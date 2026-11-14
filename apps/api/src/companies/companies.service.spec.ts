import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { CompaniesService } from './companies.service'
import { CompaniesRepository } from './companies.repository'

const mockRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  stats: jest.fn(),
  findReports: jest.fn(),
  hasMemberWithPermission: jest.fn(),
  update: jest.fn(),
}

describe('CompaniesService', () => {
  let service: CompaniesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: CompaniesRepository, useValue: mockRepo },
      ],
    }).compile()

    service = module.get(CompaniesService)
    jest.clearAllMocks()
  })

  it('returns company with stats on findById', async () => {
    mockRepo.findById.mockResolvedValue({ id: 'c1', tradeName: 'Acme' })
    mockRepo.stats.mockResolvedValue({ total: 5 })
    const res = await service.findById('c1')
    expect(res).toEqual({ id: 'c1', tradeName: 'Acme', stats: { total: 5 } })
  })

  it('throws NotFoundException when company missing', async () => {
    mockRepo.findById.mockResolvedValue(null)
    mockRepo.stats.mockResolvedValue({})
    await expect(service.findById('missing')).rejects.toThrow(NotFoundException)
  })

  it('checks MANAGE_PROFILE permission before update', async () => {
    mockRepo.findById.mockResolvedValue({ id: 'c1' })
    mockRepo.hasMemberWithPermission.mockResolvedValue(false)
    await expect(service.update('c1', 'u1', { website: 'https://x.com' } as any)).rejects.toThrow(
      ForbiddenException,
    )

    mockRepo.hasMemberWithPermission.mockResolvedValue(true)
    mockRepo.update.mockResolvedValue({ id: 'c1', website: 'https://x.com' })
    const res = await service.update('c1', 'u1', { website: 'https://x.com' } as any)
    expect(res.website).toBe('https://x.com')
  })
})
