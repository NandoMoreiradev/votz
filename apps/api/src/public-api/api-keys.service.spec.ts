import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ApiKeyTier } from '@prisma/client'
import { ApiKeysService } from './api-keys.service'
import { PrismaService } from '../prisma/prisma.service'

const mockPrisma = {
  apiKey: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}

describe('ApiKeysService', () => {
  let service: ApiKeysService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(ApiKeysService)
    jest.clearAllMocks()
  })

  it('enforces max 10 active keys per user', async () => {
    mockPrisma.apiKey.count.mockResolvedValue(10)
    await expect(service.create('u1', { name: 'Key' } as any)).rejects.toThrow(ConflictException)
  })

  it('creates key with vtz_ prefix and stores SHA-256 hash', async () => {
    mockPrisma.apiKey.count.mockResolvedValue(0)
    mockPrisma.apiKey.create.mockImplementation(async ({ data }: any) => ({
      id: 'k1',
      name: data.name,
      prefix: data.prefix,
      tier: data.tier,
    }))

    const res = await service.create('u1', { name: 'Meu Portal', tier: ApiKeyTier.FREE } as any)
    expect(res.key).toMatch(/^vtz_/)
    expect(res.prefix).toBe(res.key.slice(0, 12))
    expect(mockPrisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ keyHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      }),
    )
  })

  it('validates ownership and revocation state on revoke', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null)
    await expect(service.revoke('k1', 'u1')).rejects.toThrow(NotFoundException)

    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({ id: 'k1', userId: 'other', revokedAt: null })
    await expect(service.revoke('k1', 'u1')).rejects.toThrow(ForbiddenException)

    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({ id: 'k1', userId: 'u1', revokedAt: new Date() })
    await expect(service.revoke('k1', 'u1')).rejects.toThrow(ConflictException)

    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({ id: 'k1', userId: 'u1', revokedAt: null })
    expect(await service.revoke('k1', 'u1')).toEqual({ revoked: true })
  })
})
