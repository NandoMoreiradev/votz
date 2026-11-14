import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { PublicApiService } from './public-api.service'
import { PublicApiRepository } from './public-api.repository'

const mockRepo = {
  findReports: jest.fn(),
  findReportById: jest.fn(),
  findSurtos: jest.fn(),
  getTendencias: jest.fn(),
  findEntities: jest.fn(),
  findEntityById: jest.fn(),
}

describe('PublicApiService', () => {
  let service: PublicApiService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicApiService,
        { provide: PublicApiRepository, useValue: mockRepo },
      ],
    }).compile()

    service = module.get(PublicApiService)
    jest.clearAllMocks()
  })

  it('throws NotFoundException for missing report or entity', async () => {
    mockRepo.findReportById.mockResolvedValue(null)
    await expect(service.findReportById('r1')).rejects.toThrow(NotFoundException)

    mockRepo.findEntityById.mockResolvedValue(null)
    await expect(service.findEntityById('e1')).rejects.toThrow(NotFoundException)
  })

  it('defaults invalid period to 30 days in getTendencias', () => {
    service.getTendencias(45)
    expect(mockRepo.getTendencias).toHaveBeenCalledWith(30)

    service.getTendencias(90)
    expect(mockRepo.getTendencias).toHaveBeenCalledWith(90)
  })
})
