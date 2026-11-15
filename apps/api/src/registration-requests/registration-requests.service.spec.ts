import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { OrgType, RegistrationRequestStatus, RegistrationRequestType } from '@prisma/client'
import { RegistrationRequestsService } from './registration-requests.service'

jest.mock('isomorphic-dompurify', () => ({
  sanitize: jest.fn((v: string) => v.replace(/<script.*?>.*?<\/script>/gi, '')),
}))

describe('RegistrationRequestsService', () => {
  let service: RegistrationRequestsService
  let repo: any
  let prisma: any
  let storage: any
  let mail: any

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByRequester: jest.fn(),
      findById: jest.fn(),
      review: jest.fn(),
    }
    prisma = {
      entity: { findUnique: jest.fn() },
      politician: { findUnique: jest.fn() },
      company: { findUnique: jest.fn() },
      party: { findFirst: jest.fn() },
      orgMembership: { findFirst: jest.fn() },
      registrationRequest: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    }
    storage = {
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.url/doc.pdf'),
    }
    mail = {
      sendRegistrationApproved: jest.fn().mockResolvedValue(undefined),
      sendRegistrationRejected: jest.fn().mockResolvedValue(undefined),
    }

    service = new RegistrationRequestsService(repo, prisma, storage, mail)
  })

  describe('create', () => {
    it('sanitizes payload and creates request for new entity without duplicates', async () => {
      prisma.entity.findUnique.mockResolvedValue(null)
      prisma.registrationRequest.findFirst.mockResolvedValue(null)
      repo.create.mockResolvedValue({ id: 'req-1' })

      const res = await service.create('u1', {
        type: RegistrationRequestType.ENTITY,
        payload: { legalName: 'Prefeitura<script>alert(1)</script>', cnpj: '12.345.678/0001-99' },
        note: 'Nota<script>x</script>',
      } as any)

      expect(repo.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          type: RegistrationRequestType.ENTITY,
          payload: expect.objectContaining({ legalName: 'Prefeitura' }),
          note: 'Nota',
        }),
      )
      expect(res.id).toBe('req-1')
    })

    it('throws ConflictException when entity CNPJ already verified', async () => {
      prisma.entity.findUnique.mockResolvedValue({ id: 'e1', verified: true })
      await expect(
        service.create('u1', {
          type: RegistrationRequestType.ENTITY,
          payload: { cnpj: '12345678000199' },
        } as any),
      ).rejects.toThrow(ConflictException)
    })

    it('validates claim eligibility when claimTargetId is passed', async () => {
      prisma.politician.findUnique.mockResolvedValue({ id: 'pol-1', verified: false })
      prisma.orgMembership.findFirst.mockResolvedValue({ id: 'active-owner' })

      await expect(
        service.create('u1', {
          type: RegistrationRequestType.POLITICIAN,
          claimTargetId: 'pol-1',
          payload: {},
        } as any),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('approve & reject', () => {
    it('throws NotFoundException or BadRequestException for invalid request states', async () => {
      repo.findById.mockResolvedValueOnce(null)
      await expect(service.approve('missing', 'admin-1')).rejects.toThrow(NotFoundException)

      repo.findById.mockResolvedValueOnce({ id: 'r1', status: RegistrationRequestStatus.APPROVED })
      await expect(service.approve('r1', 'admin-1')).rejects.toThrow(BadRequestException)
    })

    it('approves claim request, seeds roles, grants OWNER, marks org verified, and sends email', async () => {
      repo.findById.mockResolvedValue({
        id: 'r1',
        status: RegistrationRequestStatus.PENDING,
        type: RegistrationRequestType.POLITICIAN,
        claimTargetId: 'pol-1',
        payload: {},
        requester: { id: 'u1', email: 'pol@votz.app', name: 'Maria' },
      })
      prisma.politician.findUnique.mockResolvedValue({ id: 'pol-1', name: 'Maria Dep' })

      const tx = {
        orgRole: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation(({ data }: any) =>
            Promise.resolve({ id: `role-${data.name}`, ...data }),
          ),
        },
        orgMembership: { create: jest.fn().mockResolvedValue({ id: 'm1' }) },
        politician: { update: jest.fn().mockResolvedValue({ id: 'pol-1', verified: true }) },
      }
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))
      repo.review.mockResolvedValue({ id: 'r1', status: RegistrationRequestStatus.APPROVED })

      const res = await service.approve('r1', 'admin-1', 'OK')

      expect(tx.orgMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          orgType: OrgType.POLITICIAN,
          orgId: 'pol-1',
          roleId: 'role-OWNER',
        }),
      })
      expect(tx.politician.update).toHaveBeenCalledWith({
        where: { id: 'pol-1' },
        data: { verified: true },
      })
      expect(mail.sendRegistrationApproved).toHaveBeenCalledWith(
        'pol@votz.app',
        'Maria',
        'POLITICIAN',
        'Maria Dep',
      )
      expect(res.status).toBe(RegistrationRequestStatus.APPROVED)
    })

    it('rejects pending request and notifies requester', async () => {
      repo.findById.mockResolvedValue({
        id: 'r2',
        status: RegistrationRequestStatus.PENDING,
        type: RegistrationRequestType.COMPANY,
        requester: { id: 'u2', email: 'co@votz.app', name: 'Empresa' },
      })
      repo.review.mockResolvedValue({ id: 'r2', status: RegistrationRequestStatus.REJECTED })

      const res = await service.reject('r2', 'admin-1', 'Documento ilegível')
      expect(repo.review).toHaveBeenCalledWith(
        'r2',
        'admin-1',
        RegistrationRequestStatus.REJECTED,
        'Documento ilegível',
      )
      expect(mail.sendRegistrationRejected).toHaveBeenCalled()
      expect(res.status).toBe(RegistrationRequestStatus.REJECTED)
    })
  })

  describe('getDocumentUrls', () => {
    it('signs only verification/ keys', async () => {
      repo.findById.mockResolvedValue({
        id: 'r1',
        payload: {
          documents: {
            rg: 'verification/rg.pdf',
            evil: '../etc/passwd',
          },
        },
      })

      const urls = await service.getDocumentUrls('r1')
      expect(urls).toEqual({ rg: 'https://signed.url/doc.pdf' })
      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith('verification/rg.pdf', 3600)
    })
  })

  describe('note handling (B-4)', () => {
    it('allows creating a request without note and omits empty/whitespace note', async () => {
      prisma.entity.findUnique.mockResolvedValue(null)
      prisma.registrationRequest.findFirst.mockResolvedValue(null)
      repo.create.mockResolvedValue({ id: 'req-no-note', note: null })

      await service.create('u1', {
        type: RegistrationRequestType.ENTITY,
        payload: { legalName: 'Autarquia Municipal', cnpj: '12345678000199' },
      } as any)

      expect(repo.create).toHaveBeenCalledWith('u1', {
        type: RegistrationRequestType.ENTITY,
        payload: { legalName: 'Autarquia Municipal', cnpj: '12345678000199' },
        claimTargetId: undefined,
      })

      await service.create('u1', {
        type: RegistrationRequestType.ENTITY,
        payload: { legalName: 'Autarquia Municipal', cnpj: '12345678000199' },
        note: '   <script>alert(1)</script>   ',
      } as any)

      expect(repo.create).toHaveBeenLastCalledWith('u1', {
        type: RegistrationRequestType.ENTITY,
        payload: { legalName: 'Autarquia Municipal', cnpj: '12345678000199' },
        claimTargetId: undefined,
      })
    })

    it('RegistrationRequestsRepository persists note and selects note on create, findAll, and findByRequester', async () => {
      const { RegistrationRequestsRepository } = require('./registration-requests.repository')
      const repoPrisma: any = {
        registrationRequest: {
          create: jest.fn().mockResolvedValue({ id: 'req-1', note: 'Observação do solicitante' }),
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      }

      const repository = new RegistrationRequestsRepository(repoPrisma)
      const created = await repository.create('u1', {
        type: RegistrationRequestType.ENTITY,
        payload: { legalName: 'Secretaria' },
        note: 'Observação do solicitante',
      })

      expect(created.note).toBe('Observação do solicitante')
      expect(repoPrisma.registrationRequest.create).toHaveBeenCalledWith({
        data: {
          requesterId: 'u1',
          type: RegistrationRequestType.ENTITY,
          payload: { legalName: 'Secretaria' },
          note: 'Observação do solicitante',
        },
        select: expect.objectContaining({ note: true, reviewNote: true }),
      })

      await repository.findAll(RegistrationRequestStatus.PENDING, 1, 20)
      expect(repoPrisma.registrationRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ note: true }),
        }),
      )

      await repository.findByRequester('u1')
      expect(repoPrisma.registrationRequest.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { requesterId: 'u1' },
          select: expect.objectContaining({ note: true }),
        }),
      )
    })
  })
})
