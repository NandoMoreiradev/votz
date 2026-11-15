import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CompaniesService } from './companies.service'
import { CompaniesRepository } from './companies.repository'
import { UpdateCompanyDto } from './dto/update-company.dto'
import { StorageService } from '../storage/storage.service'

const STORAGE_BASE = 'https://cdn.votz.app'
const mockRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  stats: jest.fn(),
  findReports: jest.fn(),
  hasMemberWithPermission: jest.fn(),
  update: jest.fn(),
}

const mockStorage = {
  assertOwnStorageUrl: jest.fn((url: string, folder?: string) => {
    if (!url.startsWith(`${STORAGE_BASE}/${folder ? `${folder}/` : ''}`)) {
      throw new BadRequestException('Envie o arquivo pelo Votz')
    }
  }),
}

describe('CompaniesService', () => {
  let service: CompaniesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: CompaniesRepository, useValue: mockRepo },
        { provide: StorageService, useValue: mockStorage },
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

  it('validates logoUrl belongs to entities folder and blocks ftp:// on website', async () => {
    mockRepo.findById.mockResolvedValue({ id: 'c1' })
    mockRepo.hasMemberWithPermission.mockResolvedValue(true)

    await expect(
      service.update('c1', 'u1', { logoUrl: 'https://evil.example/logo.png' }),
    ).rejects.toThrow(BadRequestException)

    await expect(
      service.update('c1', 'u1', { logoUrl: `${STORAGE_BASE}/avatars/wrong.png` }),
    ).rejects.toThrow(BadRequestException)

    mockRepo.update.mockResolvedValue({ id: 'c1', logoUrl: `${STORAGE_BASE}/entities/logo.png` })
    await expect(
      service.update('c1', 'u1', { logoUrl: `${STORAGE_BASE}/entities/logo.png` }),
    ).resolves.toMatchObject({ logoUrl: `${STORAGE_BASE}/entities/logo.png` })

    const ftpDto = plainToInstance(UpdateCompanyDto, { website: 'ftp://files.example.com' })
    expect(await validate(ftpDto)).not.toHaveLength(0)
  })
})
