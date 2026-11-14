import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { RegistrationRequestStatus } from '@prisma/client'
import {
  VerificationRetentionService,
  VERIFICATION_RETENTION_QUEUE,
} from './verification-retention.service'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'

const mockQueue = { add: jest.fn() }
const mockStorage = { delete: jest.fn() }
const mockPrisma = {
  registrationRequest: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
}

describe('VerificationRetentionService', () => {
  let service: VerificationRetentionService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationRetentionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: getQueueToken(VERIFICATION_RETENTION_QUEUE), useValue: mockQueue },
      ],
    }).compile()

    service = module.get(VerificationRetentionService)
    jest.clearAllMocks()
    mockStorage.delete.mockResolvedValue(undefined)
    mockPrisma.registrationRequest.update.mockResolvedValue({})
  })

  it('queries REJECTED < 30 days and APPROVED < 12 months (never PENDING) in batches of 100', async () => {
    const now = new Date('2026-11-14T04:00:00.000Z')
    mockPrisma.registrationRequest.findMany.mockResolvedValue([])

    await service.purgeExpiredDocuments(now)

    expect(mockPrisma.registrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              status: RegistrationRequestStatus.REJECTED,
              updatedAt: { lt: new Date('2026-10-15T04:00:00.000Z') },
            },
            {
              status: RegistrationRequestStatus.APPROVED,
              updatedAt: { lt: new Date('2025-11-14T04:00:00.000Z') },
            },
          ],
        },
        take: 100,
      }),
    )
  })

  it('purges verification R2 files for expired REJECTED (>30d) and APPROVED (>12m), preserves remaining payload, and is idempotent on re-run', async () => {
    const now = new Date('2026-11-14T04:00:00.000Z')
    const expiredRejected = {
      id: 'req-rejected-old',
      status: RegistrationRequestStatus.REJECTED,
      updatedAt: new Date('2026-10-01T00:00:00.000Z'), // > 30d
      payload: {
        orgName: 'Prefeitura A',
        cnpj: '12345678000100',
        documents: {
          statute: 'verification/req-1/statute.pdf',
          idCard: 'verification/req-1/id.jpg',
        },
      },
    }
    const recentRejected = {
      id: 'req-rejected-recent',
      status: RegistrationRequestStatus.REJECTED,
      updatedAt: new Date('2026-10-30T00:00:00.000Z'), // < 30d
      payload: {
        orgName: 'Prefeitura Recent',
        documents: { doc: 'verification/recent-rejected.pdf' },
      },
    }
    const expiredApproved = {
      id: 'req-approved-old',
      status: RegistrationRequestStatus.APPROVED,
      updatedAt: new Date('2025-10-01T00:00:00.000Z'), // > 12m
      payload: {
        orgName: 'Prefeitura B',
        documents: {
          diploma: 'verification/req-2/diploma.pdf',
        },
      },
    }
    const recentApproved = {
      id: 'req-approved-recent',
      status: RegistrationRequestStatus.APPROVED,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'), // < 12m
      payload: {
        orgName: 'Prefeitura Approved Recent',
        documents: { doc: 'verification/recent-approved.pdf' },
      },
    }
    const pendingOld = {
      id: 'req-pending-old',
      status: RegistrationRequestStatus.PENDING,
      updatedAt: new Date('2024-01-01T00:00:00.000Z'), // PENDING never purged
      payload: {
        orgName: 'Prefeitura Pendente',
        documents: { doc: 'verification/pending.pdf' },
      },
    }

    mockPrisma.registrationRequest.findMany.mockResolvedValueOnce([
      expiredRejected,
      recentRejected,
      expiredApproved,
      recentApproved,
      pendingOld,
    ])

    const res1 = await service.purgeExpiredDocuments(now)

    expect(res1).toEqual({
      scanned: 5,
      purgedRequests: 2,
      deletedFiles: 3,
      failedFiles: 0,
    })

    expect(mockStorage.delete).not.toHaveBeenCalledWith('verification/recent-rejected.pdf')
    expect(mockStorage.delete).not.toHaveBeenCalledWith('verification/recent-approved.pdf')
    expect(mockStorage.delete).not.toHaveBeenCalledWith('verification/pending.pdf')

    expect(mockStorage.delete).toHaveBeenCalledWith('verification/req-1/statute.pdf')
    expect(mockStorage.delete).toHaveBeenCalledWith('verification/req-1/id.jpg')
    expect(mockStorage.delete).toHaveBeenCalledWith('verification/req-2/diploma.pdf')

    expect(mockPrisma.registrationRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-rejected-old' },
      data: {
        payload: {
          orgName: 'Prefeitura A',
          cnpj: '12345678000100',
          documentsPurgedAt: now.toISOString(),
        },
      },
    })
    expect(mockPrisma.registrationRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-approved-old' },
      data: {
        payload: {
          orgName: 'Prefeitura B',
          documentsPurgedAt: now.toISOString(),
        },
      },
    })

    // Re-running on already purged payloads must be idempotent (no deletes or updates)
    jest.clearAllMocks()
    const purgedPayloads = [
      { id: 'req-rejected-old', payload: { orgName: 'Prefeitura A', documentsPurgedAt: now.toISOString() } },
      { id: 'req-approved-old', payload: { orgName: 'Prefeitura B', documentsPurgedAt: now.toISOString() } },
    ]
    mockPrisma.registrationRequest.findMany.mockResolvedValueOnce(purgedPayloads)

    const res2 = await service.purgeExpiredDocuments(now)
    expect(res2).toEqual({
      scanned: 2,
      purgedRequests: 0,
      deletedFiles: 0,
      failedFiles: 0,
    })
    expect(mockStorage.delete).not.toHaveBeenCalled()
    expect(mockPrisma.registrationRequest.update).not.toHaveBeenCalled()
  })

  it('continues deleting remaining files on R2 failure and removes only successfully deleted files from payload', async () => {
    const now = new Date('2026-11-14T04:00:00.000Z')
    mockPrisma.registrationRequest.findMany.mockResolvedValueOnce([
      {
        id: 'req-partial',
        payload: {
          orgName: 'Empresa X',
          documents: {
            docA: 'verification/a.pdf',
            docB: 'verification/b.pdf',
          },
        },
      },
    ])

    mockStorage.delete
      .mockRejectedValueOnce(new Error('R2 timeout'))
      .mockResolvedValueOnce(undefined)

    const res = await service.purgeExpiredDocuments(now)

    expect(res).toEqual({
      scanned: 1,
      purgedRequests: 1,
      deletedFiles: 1,
      failedFiles: 1,
    })
    expect(mockStorage.delete).toHaveBeenCalledWith('verification/a.pdf')
    expect(mockStorage.delete).toHaveBeenCalledWith('verification/b.pdf')
    expect(mockPrisma.registrationRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-partial' },
      data: {
        payload: {
          orgName: 'Empresa X',
          documents: {
            docA: 'verification/a.pdf',
          },
        },
      },
    })
  })
})
