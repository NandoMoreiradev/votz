import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { OrgPermission } from '@prisma/client'
import { PropostaStatus, UserType } from '@votz/shared-types'

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (s: string) => s },
}))

import { PropostasService } from './propostas.service'
import { PropostasRepository } from './propostas.repository'
import { PrismaService } from '../prisma/prisma.service'

const mockRepo = {
  findPoliticianById: jest.fn(),
  create: jest.fn(),
  addTimeline: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  upsertVoto: jest.fn(),
  removeVoto: jest.fn(),
  findMeuVoto: jest.fn(),
}

const mockPrisma = {
  orgMembership: { findUnique: jest.fn() },
}

const polCtx = (id = 'p1', permissions: string[] = [OrgPermission.MANAGE_PROFILE, OrgPermission.RESPOND_REPORTS]) => ({
  type: 'POLITICIAN' as const,
  id,
  name: 'Pol 1',
  logoUrl: null,
  permissions,
})

describe('PropostasService', () => {
  let service: PropostasService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropostasService,
        { provide: PropostasRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(PropostasService)
    jest.clearAllMocks()
    mockPrisma.orgMembership.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      role: { permissions: [OrgPermission.MANAGE_PROFILE, OrgPermission.RESPOND_REPORTS] },
    })
  })

  describe('create', () => {
    const dto = { titulo: 'PL Saúde', descricao: 'Mais médicos', categorias: ['HEALTH'] } as any

    it('rejects users without active POLITICIAN context (even if User.type is POLITICIAN)', async () => {
      await expect(service.create(dto, { id: 'u1', type: UserType.POLITICIAN, ctx: null })).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('requires MANDATO or MANDATO_PRO plan and rejects BASICO with PLAN_REQUIRED', async () => {
      mockRepo.findPoliticianById.mockResolvedValue({ id: 'p1', plan: 'BASICO' })
      await expect(
        service.create(dto, { id: 'u1', type: UserType.CITIZEN, ctx: polCtx('p1') }),
      ).rejects.toMatchObject({
        response: {
          code: 'PLAN_REQUIRED',
          feature: 'propostas',
          requiredPlan: 'MANDATO',
        },
      })
    })

    it('creates proposta for MANDATO and MANDATO_PRO active contexts and records CREATED timeline event', async () => {
      mockRepo.findPoliticianById.mockResolvedValueOnce({ id: 'p1', plan: 'MANDATO' })
      mockRepo.create.mockResolvedValueOnce({ id: 'prop-1', titulo: 'PL Saúde' })

      const resMandato = await service.create(dto, { id: 'u1', type: UserType.CITIZEN, ctx: polCtx('p1') })
      expect(resMandato.id).toBe('prop-1')

      mockRepo.findPoliticianById.mockResolvedValueOnce({ id: 'p1', plan: 'MANDATO_PRO' })
      mockRepo.create.mockResolvedValueOnce({ id: 'prop-2', titulo: 'PL Saúde' })

      const resPro = await service.create(dto, { id: 'u1', type: UserType.CITIZEN, ctx: polCtx('p1') })
      expect(resPro.id).toBe('prop-2')
      expect(mockRepo.addTimeline).toHaveBeenCalledTimes(2)
    })
  })

  describe('updateStatus & votar', () => {
    it('rejects status change on ARCHIVED proposals', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'prop-1',
        politicoId: 'p1',
        status: PropostaStatus.ARCHIVED,
      })

      await expect(
        service.updateStatus(
          'prop-1',
          { status: PropostaStatus.APPROVED, conteudo: 'x' } as any,
          { id: 'u1', type: UserType.CITIZEN, ctx: polCtx('p1') },
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects voting on DRAFT proposals and throws NotFoundException if missing', async () => {
      mockRepo.findById.mockResolvedValueOnce(null)
      await expect(service.votar('missing', true, 'u1')).rejects.toThrow(NotFoundException)

      mockRepo.findById.mockResolvedValueOnce({ id: 'prop-1', status: PropostaStatus.DRAFT })
      await expect(service.votar('prop-1', true, 'u1')).rejects.toThrow(BadRequestException)

      mockRepo.findById.mockResolvedValueOnce({ id: 'prop-1', status: PropostaStatus.PRESENTED })
      expect(await service.votar('prop-1', true, 'u1')).toEqual({ votado: true, apoio: true })
    })
  })
})
