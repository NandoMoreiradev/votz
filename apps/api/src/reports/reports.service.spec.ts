import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (s: string) => s },
}))

import { ReportsService } from './reports.service'
import { ReportsRepository } from './reports.repository'
import { TimelineService } from '../timeline/timeline.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AlertsService } from '../alerts/alerts.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { ReportMediaService } from '../storage/report-media.service'
import { REPORTS_QUEUE } from './jobs/generate-embedding.processor'
import { ReportStatus, EventType } from '@votz/shared-types'
import { OrgPermission } from '@prisma/client'
import { DisputeResolution } from './dto/resolve-dispute.dto'
import { ReportLifecycleService } from '../report-lifecycle/report-lifecycle.service'

const mockRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
  findAuthorId: jest.fn(),
  getFollowerUserIds: jest.fn().mockResolvedValue([]),
  addFollower: jest.fn(),
  removeFollower: jest.fn(),
  findFollower: jest.fn(),
  findByTrigram: jest.fn(),
  findByFullText: jest.fn(),
  findByEmbedding: jest.fn(),
}

const mockTimeline = { record: jest.fn() }
const mockNotifications = { notify: jest.fn() }
const mockAlerts = { enqueueCheck: jest.fn().mockResolvedValue(undefined) }
const mockEmbedding = { embed: jest.fn().mockResolvedValue([]) }
const mockPrisma = {
  politician: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  follower: { findMany: jest.fn().mockResolvedValue([]) },
  entity: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  orgMembership: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
}
const mockLifecycle = {
  updateFromReportPage: jest.fn().mockResolvedValue({}),
  dispute: jest.fn().mockResolvedValue({}),
  resolveDispute: jest.fn().mockResolvedValue({}),
  confirmResolution: jest.fn().mockResolvedValue({}),
  withdrawAdvocacy: jest.fn().mockResolvedValue({}),
  disputeQueue: jest.fn().mockResolvedValue({ data: [] }),
}
const mockReportsQueue = { add: jest.fn().mockResolvedValue({}) }
const mockReportMedia = { attach: jest.fn().mockResolvedValue(undefined), itemsFor: jest.fn().mockResolvedValue([]) }
const STORAGE_BASE = 'https://cdn.votz.app'
const mockStorage = {
  assertOwnStorageUrls: jest.fn((urls: string[] | undefined, folder?: string) => {
    for (const url of urls ?? []) {
      if (!url.startsWith(`${STORAGE_BASE}/${folder ? `${folder}/` : ''}`)) {
        throw new BadRequestException('Envie o arquivo pelo Votz')
      }
    }
  }),
}

function makeReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'report-1',
    title: 'Buraco na rua principal',
    description: 'Buraco grande causando acidentes.',
    status: ReportStatus.OPEN,
    anonymous: false,
    author: { id: 'author-1', name: 'Cidadão', avatarUrl: null },
    timeline: [] as Array<{ id: string; type: string; content: string; createdAt: Date }>,
    ...overrides,
  }
}

describe('ReportsService', () => {
  let service: ReportsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ReportsRepository, useValue: mockRepo },
        { provide: TimelineService, useValue: mockTimeline },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: AlertsService, useValue: mockAlerts },
        { provide: EmbeddingService, useValue: mockEmbedding },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: getQueueToken(REPORTS_QUEUE), useValue: mockReportsQueue },
        { provide: ReportMediaService, useValue: mockReportMedia },
        { provide: ReportLifecycleService, useValue: mockLifecycle },
      ],
    }).compile()

    service = module.get<ReportsService>(ReportsService)
    jest.clearAllMocks()
    mockNotifications.notify.mockResolvedValue(undefined)
    mockTimeline.record.mockResolvedValue(undefined)
    mockAlerts.enqueueCheck.mockResolvedValue(undefined)
    mockReportsQueue.add.mockResolvedValue({})
    mockReportMedia.attach.mockResolvedValue(undefined)
    mockPrisma.follower.findMany.mockResolvedValue([])
    mockPrisma.politician.findMany.mockResolvedValue([])
    mockPrisma.entity.findMany.mockResolvedValue([])
    mockPrisma.orgMembership.findMany.mockResolvedValue([])
    mockReportMedia.itemsFor.mockResolvedValue([])
    mockPrisma.orgMembership.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      role: { permissions: [OrgPermission.RESPOND_REPORTS, OrgPermission.MANAGE_PROFILE] },
    })
    mockRepo.getFollowerUserIds.mockResolvedValue([])
  })

  // ──────────────────────────────────────────────
  // create()
  // ──────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      title: 'Problema de iluminação',
      description: 'Sem luz há 3 dias na rua.',
      category: 'INFRASTRUCTURE',
      anonymous: false,
      media: [],
    } as any

    it('throws BadRequestException when email is not verified', async () => {
      await expect(
        service.create(dto, { id: 'u1', type: 'CITIZEN', emailVerified: false }),
      ).rejects.toThrow(BadRequestException)
    })

    it('creates report and records CREATED timeline event', async () => {
      const created = makeReport({ id: 'r1' })
      mockRepo.create.mockResolvedValue(created)

      const result = await service.create(dto, { id: 'u1', type: 'CITIZEN', emailVerified: true })

      expect(result).toEqual(created)
      expect(mockRepo.create).toHaveBeenCalledTimes(1)
      expect(mockTimeline.record).toHaveBeenCalledWith(
        expect.objectContaining({ reportId: 'r1', type: EventType.CREATED }),
      )
    })

    describe('cidade e UF', () => {
      const user = { id: 'u1', type: 'CITIZEN', emailVerified: true }
      const spCities = [{ city: 'São Paulo' }, { city: "Santa Bárbara d'Oeste" }, { city: 'Embu-Guaçu' }]

      it('aceita cidade que existe na UF, sem olhar acento, caixa ou pontuação', async () => {
        mockPrisma.entity.findMany.mockResolvedValue(spCities)
        mockRepo.create.mockResolvedValue(makeReport({ id: 'r1' }))

        for (const city of ['São Paulo', 'sao paulo', "SANTA BARBARA D'OESTE", 'Embu Guacu']) {
          await expect(service.create({ ...dto, city, state: 'SP' }, user)).resolves.toBeDefined()
        }
        expect(mockPrisma.entity.findMany).toHaveBeenCalledTimes(1) // lista da UF fica em cache
        expect(mockPrisma.entity.findMany).toHaveBeenCalledWith({ where: { state: 'SP', ibgeCode: { not: null } }, select: { city: true } })
      })

      it('recusa cidade que não existe na UF e não grava o relato', async () => {
        mockPrisma.entity.findMany.mockImplementation(async ({ where }: { where: { state: string } }) =>
          where.state === 'SP' ? spCities : [{ city: 'Rio Branco' }])
        mockRepo.create.mockClear()

        await expect(service.create({ ...dto, city: 'Xyzlândia', state: 'SP' }, user)).rejects.toThrow(/Xyzlândia.*SP/)
        // cidade de outra UF também é recusada
        await expect(service.create({ ...dto, city: 'São Paulo', state: 'AC' }, user)).rejects.toThrow(BadRequestException)
        expect(mockRepo.create).not.toHaveBeenCalled()
      })

      it('não bloqueia quando a lista da UF ainda não foi sincronizada, nem quando falta cidade ou UF', async () => {
        mockPrisma.entity.findMany.mockResolvedValue([])
        mockRepo.create.mockResolvedValue(makeReport({ id: 'r1' }))

        await expect(service.create({ ...dto, city: 'Qualquer', state: 'SP' }, user)).resolves.toBeDefined()
        await expect(service.create({ ...dto, city: 'Qualquer' }, user)).resolves.toBeDefined()
        await expect(service.create({ ...dto, state: 'SP' }, user)).resolves.toBeDefined()
      })
    })

    it('passes null authorId for anonymous reports', async () => {
      const created = makeReport({ id: 'r1', anonymous: true, author: null })
      mockRepo.create.mockResolvedValue(created)

      await service.create({ ...dto, anonymous: true }, { id: 'u1', type: 'CITIZEN', emailVerified: true })

      expect(mockTimeline.record).toHaveBeenCalledWith(
        expect.objectContaining({ authorId: null }),
      )
    })
  })

  // ──────────────────────────────────────────────
  // findById()
  // ──────────────────────────────────────────────

  describe('findById', () => {
    const fullReport = (overrides: Partial<Record<string, unknown>> = {}) =>
      makeReport({
        moderationStatus: 'VISIBLE',
        recipientType: 'ENTITY',
        recipientId: 'entity-1',
        media: [],
        advocacies: [],
        ...overrides,
      })

    it('throws NotFoundException when report does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException)
    })

    it('relato oculto pela moderação não abre nem pelo link direto', async () => {
      mockRepo.findById.mockResolvedValue(fullReport({ moderationStatus: 'HIDDEN' }))
      await expect(service.findById('report-1')).rejects.toThrow(NotFoundException)
    })

    it('returns the report when found, with media sizes and without the moderation flag', async () => {
      mockRepo.findById.mockResolvedValue(fullReport())
      const result = await service.findById('report-1')
      expect(result).toEqual(expect.objectContaining({ id: 'report-1', mediaItems: [], advocacies: [], timeline: [] }))
      expect(result).not.toHaveProperty('moderationStatus')
      expect(mockReportMedia.itemsFor).toHaveBeenCalled()
    })

    it('na Memória pública quem fala é a instituição, não a pessoa da equipe', async () => {
      mockPrisma.entity.findMany.mockResolvedValue([
        { id: 'entity-1', legalName: 'Prefeitura de Teste', logoUrl: 'logo.png', city: 'Teste', state: 'SP' },
      ])
      mockRepo.findById.mockResolvedValue(
        fullReport({
          timeline: [
            {
              id: 't1',
              type: EventType.RESPONDED,
              content: 'Equipe vai ao local amanhã.',
              metadata: { orgType: 'ENTITY', orgId: 'entity-1', orgName: 'Prefeitura de Teste' },
              createdAt: new Date(),
              author: { id: 'staff-1', name: 'Fulano da Silva', avatarUrl: null },
            },
          ],
        }),
      )
      const result = await service.findById('report-1')
      expect(result.timeline[0].author).toBeNull()
      expect(result.timeline[0].actorOrg).toEqual({ type: 'ENTITY', id: 'entity-1', name: 'Prefeitura de Teste', avatarUrl: 'logo.png' })
    })

    it('decisão da moderação aparece como "Moderação do Votz"', async () => {
      mockRepo.findById.mockResolvedValue(
        fullReport({
          timeline: [
            {
              id: 't1',
              type: EventType.STATUS_CHANGED,
              content: 'Contestação aceita.',
              metadata: { action: 'dispute_decided', decision: 'REOPEN', actorRole: 'MODERATION' },
              createdAt: new Date(),
              author: { id: 'mod-1', name: 'Moderadora', avatarUrl: null },
            },
          ],
        }),
      )
      const result = await service.findById('report-1')
      expect(result.timeline[0].author).toBeNull()
      expect(result.timeline[0].actorOrg).toEqual(expect.objectContaining({ type: 'MODERATION', name: 'Moderação do Votz' }))
    })

    it('em relato anônimo, a contestação não mostra quem contestou e o id interno não sai', async () => {
      mockRepo.findById.mockResolvedValue(
        fullReport({
          anonymous: true,
          author: null,
          timeline: [
            {
              id: 't1',
              type: EventType.DISPUTED,
              content: 'Continua igual.',
              metadata: { disputerUserId: 'u-secret', disputedBy: 'AUTHOR' },
              createdAt: new Date(),
              author: { id: 'u-secret', name: 'Quem contestou', avatarUrl: null },
            },
          ],
        }),
      )
      const result = await service.findById('report-1')
      expect(result.timeline[0].author).toBeNull()
      expect(result.timeline[0].metadata).not.toHaveProperty('disputerUserId')
    })

    it('evento antigo sem instituição gravada é atribuído ao destinatário quando quem escreveu é da equipe', async () => {
      mockPrisma.entity.findMany.mockResolvedValue([
        { id: 'entity-1', legalName: 'Prefeitura de Teste', logoUrl: null, city: 'Teste', state: 'SP' },
      ])
      mockPrisma.orgMembership.findMany.mockResolvedValue([{ userId: 'staff-1' }])
      mockRepo.findById.mockResolvedValue(
        fullReport({
          timeline: [
            {
              id: 't1',
              type: EventType.UPDATE,
              content: 'Atualização antiga.',
              metadata: null,
              createdAt: new Date(),
              author: { id: 'staff-1', name: 'Fulano', avatarUrl: null },
            },
          ],
        }),
      )
      const result = await service.findById('report-1')
      expect(result.timeline[0].author).toBeNull()
      expect(result.timeline[0].actorOrg).toEqual(expect.objectContaining({ type: 'ENTITY', id: 'entity-1' }))
    })
  })

  // ──────────────────────────────────────────────
  // Ciclo de vida: a regra mora em ReportLifecycleService
  // ──────────────────────────────────────────────

  describe('ciclo de vida (delegação)', () => {
    it('updateStatus, dispute, resolveDispute, confirmResolution, withdrawAdvocacy e disputeQueue passam para o ciclo de vida', async () => {
      const user = { id: 'u1', type: 'CITIZEN' }
      await service.updateStatus('r1', { content: 'Equipe enviada.' }, user)
      expect(mockLifecycle.updateFromReportPage).toHaveBeenCalledWith('r1', { content: 'Equipe enviada.' }, user)

      await service.dispute('r1', { reason: 'Continua igual ao que era antes.' }, 'u1')
      expect(mockLifecycle.dispute).toHaveBeenCalledWith('r1', { reason: 'Continua igual ao que era antes.' }, 'u1')

      const mod = { id: 'mod-1', type: 'MODERATOR' }
      await service.resolveDispute('r1', { decision: DisputeResolution.REOPEN, justification: 'Fotos mostram o buraco aberto.' }, mod)
      expect(mockLifecycle.resolveDispute).toHaveBeenCalledWith(
        'r1',
        { decision: DisputeResolution.REOPEN, justification: 'Fotos mostram o buraco aberto.' },
        mod,
      )

      await service.confirmResolution('r1', 'u1')
      expect(mockLifecycle.confirmResolution).toHaveBeenCalledWith('r1', 'u1')

      await service.withdrawAdvocacy('r1', user, 'Outro órgão assumiu.')
      expect(mockLifecycle.withdrawAdvocacy).toHaveBeenCalledWith('r1', user, 'Outro órgão assumiu.')

      await service.disputeQueue(mod, 2, 10)
      expect(mockLifecycle.disputeQueue).toHaveBeenCalledWith(mod, 2, 10)
    })
  })

  describe('media storage ownership on create (A4)', () => {
    const validMedia = [`${STORAGE_BASE}/reports/11111111-1111-4111-8111-111111111111.jpg`]
    const base = {
      title: 'Buraco grande na via',
      description: 'Buraco atrapalhando trânsito.',
      category: 'INFRASTRUCTURE' as any,
      latitude: -23.5,
      longitude: -46.6,
    }
    const citizen = { id: 'u1', type: 'CITIZEN', emailVerified: true }

    it('rejects external and wrong-folder URLs', async () => {
      await expect(service.create({ ...base, media: ['https://evil.example/track.jpg'] } as any, citizen)).rejects.toThrow(BadRequestException)
      await expect(service.create({ ...base, media: [`${STORAGE_BASE}/avatars/wrong.jpg`] } as any, citizen)).rejects.toThrow(BadRequestException)
      expect(mockReportMedia.attach).not.toHaveBeenCalled()
    })

    it('accepts valid reports/ storage URLs and marks them as used', async () => {
      mockRepo.create.mockResolvedValue({ id: 'r1', category: 'INFRASTRUCTURE' })
      await service.create({ ...base, media: validMedia } as any, citizen)
      expect(mockRepo.create).toHaveBeenCalled()
      expect(mockReportMedia.attach).toHaveBeenCalledWith(validMedia, 'u1')
    })

    it('arquivo de outra pessoa barra o relato ANTES de gravar', async () => {
      mockReportMedia.attach.mockRejectedValueOnce(new ForbiddenException('Você só pode anexar arquivos que você mesmo enviou.'))
      await expect(service.create({ ...base, media: validMedia } as any, citizen)).rejects.toBeInstanceOf(ForbiddenException)
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('sem mídia, não consulta nem recusa nada', async () => {
      mockRepo.create.mockResolvedValue({ id: 'r1', category: 'INFRASTRUCTURE' })
      await service.create(base as any, citizen)
      expect(mockReportMedia.attach).toHaveBeenCalledWith(undefined, 'u1')
      expect(mockRepo.create).toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────
  // findSimilar()
  // ──────────────────────────────────────────────

  describe('findSimilar', () => {
    const row = (id: string, score: number, overrides: Partial<Record<string, unknown>> = {}) => ({
      id,
      title: `Relato ${id}`,
      description: 'Descrição do relato',
      category: 'INFRASTRUCTURE',
      status: 'OPEN',
      city: 'São Paulo',
      state: 'SP',
      createdAt: new Date('2026-11-20T00:00:00Z'),
      pressureScore: 10,
      score,
      ...overrides,
    })

    beforeEach(() => {
      mockRepo.findByTrigram.mockResolvedValue([])
      mockRepo.findByFullText.mockResolvedValue([])
      mockRepo.findByEmbedding.mockResolvedValue([])
      mockEmbedding.embed.mockResolvedValue([0.1, 0.2, 0.3])
    })

    it('combina trigram, full-text e semântico com peso 1.5 e usa embedding em modo query', async () => {
      mockRepo.findByTrigram.mockResolvedValue([row('r1', 0.4), row('r2', 0.6)])
      mockRepo.findByFullText.mockResolvedValue([row('r1', 0.3)])
      mockRepo.findByEmbedding.mockResolvedValue([row('r1', 0.8), row('r3', 0.9)])

      const results = await service.findSimilar('  Buraco na avenida principal  ', 'Perto da escola', 5)

      expect(mockEmbedding.embed).toHaveBeenCalledWith('Buraco na avenida principal Perto da escola', 'query')
      expect(results.map((r) => r.id)).toEqual(['r1', 'r3', 'r2'])
      expect(results[0].sources).toEqual(['trigram', 'fulltext', 'semantic'])
      expect(results[0].score).toBeCloseTo(0.4 + 0.3 + 0.8 * 1.5)
    })

    it('repassa filtros normalizados de categoria, estado e cidade para todas as buscas', async () => {
      await service.findSimilar('Falta de luz no bairro', undefined, 5, {
        category: 'INFRASTRUCTURE' as any,
        state: 'sp',
        city: 'São Paulo',
      })

      const expectedFilters = {
        category: 'INFRASTRUCTURE',
        state: 'SP',
        cityKey: 'sao paulo',
        cityLower: 'são paulo',
      }
      expect(mockRepo.findByTrigram).toHaveBeenCalledWith('Falta de luz no bairro', '', 5, expectedFilters)
      expect(mockRepo.findByFullText).toHaveBeenCalledWith('Falta de luz no bairro', 5, expectedFilters)
      expect(mockRepo.findByEmbedding).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5, undefined, expectedFilters)
    })

    it('reaproveita o embedding em cache para consultas repetidas sem chamar o Gemini novamente', async () => {
      await service.findSimilar('Poste queimado na praça', 'Sem iluminação há dias', 5)
      await service.findSimilar('  poste   queimado na praça ', 'sem iluminação há dias', 5, { state: 'RJ' })

      expect(mockEmbedding.embed).toHaveBeenCalledTimes(1)
      expect(mockRepo.findByEmbedding).toHaveBeenCalledTimes(2)
    })

    it('continua retornando resultados lexicais quando a busca semântica falha', async () => {
      mockEmbedding.embed.mockRejectedValueOnce(new Error('429 quota exceeded'))
      mockRepo.findByTrigram.mockResolvedValue([row('r1', 0.5)])

      const results = await service.findSimilar('Vazamento de água na esquina', undefined, 5)

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('r1')
      expect(results[0].sources).toEqual(['trigram'])
    })
  })
})
