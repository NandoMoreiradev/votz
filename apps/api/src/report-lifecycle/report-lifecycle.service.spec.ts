jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (s: string) => s },
}))

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { OrgPermission, Prisma } from '@prisma/client'
import { ArchiveReason, EventType, ReportStatus, TIMELINE_ACTIONS, checkDisputeWindow } from '@votz/shared-types'
import { ReportLifecycleService } from './report-lifecycle.service'
import { UpdatableStatus } from '../reports/dto/update-status.dto'
import { DisputeResolution } from '../reports/dto/resolve-dispute.dto'

// ── Banco de mentira, com estado ─────────────────────────────────────────────

type Row = Record<string, any>

interface State {
  report: Row | null
  events: Row[]
  advocacies: Row[]
  meToo: string[]
  politicians: Record<string, Row>
  entities: Record<string, Row>
}

const DAY = 86_400_000

function makeState(report: Partial<Row> = {}): State {
  return {
    report: {
      id: 'r1',
      title: 'Buraco na rua principal',
      status: ReportStatus.OPEN,
      category: 'INFRASTRUCTURE',
      anonymous: false,
      authorId: 'author-1',
      recipientType: 'ENTITY',
      recipientId: 'e1',
      moderationStatus: 'VISIBLE',
      firstResponseAt: null,
      resolvedAt: null,
      archivedAt: null,
      resolutionConfirmedAt: null,
      state: 'SP',
      city: 'São Paulo',
      cityKey: 'sao paulo',
      ...report,
    },
    events: [],
    advocacies: [],
    meToo: [],
    politicians: {
      p1: { name: 'Vereadora Ana', status: 'ATIVO', office: 'Vereador', state: 'SP', city: 'São Paulo' },
      p2: { name: 'Deputado Beto', status: 'ATIVO', office: 'Deputado Federal', state: 'SP', city: null },
      p3: { name: 'Vereador de Campinas', status: 'ATIVO', office: 'Vereador', state: 'SP', city: 'Campinas' },
      p4: { name: 'Deputado do Rio', status: 'ATIVO', office: 'Deputado Federal', state: 'RJ', city: null },
      pEnc: { name: 'Ex-vereador', status: 'ENCERRADO', office: 'Vereador', state: 'SP', city: 'São Paulo' },
    },
    entities: {
      e1: { legalName: 'Prefeitura de São Paulo', state: 'SP' },
      e2: { legalName: 'Sabesp', state: 'SP' },
      eRJ: { legalName: 'Cedae', state: 'RJ' },
    },
  }
}

function makeDb(state: State) {
  const advKey = (w: Row) => w.reportId_orgType_orgId
  const findAdv = (k: Row) =>
    state.advocacies.find((a) => a.reportId === k.reportId && a.orgType === k.orgType && a.orgId === k.orgId)

  const db: any = {
    report: {
      findUnique: jest.fn(async () =>
        state.report
          ? { ...state.report, timeline: state.events.filter((e) => e.type === EventType.DISPUTED).map((e) => ({ createdAt: e.createdAt })) }
          : null,
      ),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const r = state.report
        if (!r || r.id !== where.id) return { count: 0 }
        if (where.status !== undefined && r.status !== where.status) return { count: 0 }
        if ('firstResponseAt' in where && where.firstResponseAt === null && r.firstResponseAt) return { count: 0 }
        if ('resolutionConfirmedAt' in where && where.resolutionConfirmedAt === null && r.resolutionConfirmedAt) return { count: 0 }
        Object.assign(r, data)
        return { count: 1 }
      }),
    },
    timelineEvent: {
      create: jest.fn(async ({ data }: Row) => {
        const ev = { id: `ev${state.events.length + 1}`, createdAt: new Date(), ...data }
        state.events.push(ev)
        return ev
      }),
      findFirst: jest.fn(async ({ where }: Row) => [...state.events].reverse().find((e) => e.type === where.type) ?? null),
    },
    orgMembership: {
      findUnique: jest.fn(async () => ({ status: 'ACTIVE', role: { permissions: [OrgPermission.RESPOND_REPORTS] } })),
    },
    politician: { findUnique: jest.fn(async ({ where }: Row) => state.politicians[where.id] ?? null) },
    entity: { findUnique: jest.fn(async ({ where }: Row) => state.entities[where.id] ?? null) },
    reportAdvocacy: {
      findUnique: jest.fn(async ({ where }: Row) => findAdv(advKey(where)) ?? null),
      create: jest.fn(async ({ data }: Row) => {
        state.advocacies.push({ ...data })
        return data
      }),
      update: jest.fn(async ({ where, data }: Row) => Object.assign(findAdv(advKey(where))!, data)),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = state.advocacies.filter(
          (a) => a.reportId === where.reportId && a.orgType === where.orgType && a.orgId === where.orgId && a.closedAt === null,
        )
        rows.forEach((a) => Object.assign(a, data))
        return { count: rows.length }
      }),
    },
    reportFollower: { upsert: jest.fn(async () => ({})) },
    vote: { findFirst: jest.fn(async ({ where }: Row) => (state.meToo.includes(where.userId) ? { id: 'v1' } : null)) },
  }
  db.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db))
  return db
}

const effects = {
  afterStatusChange: jest.fn(),
  afterUpdate: jest.fn(),
  afterAdvocacy: jest.fn(),
  afterDispute: jest.fn(),
  afterDisputeDecision: jest.fn(),
  afterConfirmation: jest.fn(),
}

const STORAGE = 'https://cdn.votz.app'
const storage = {
  assertOwnStorageUrls: jest.fn((urls: string[] | undefined, folder: string) => {
    for (const u of urls ?? []) {
      if (!u.startsWith(`${STORAGE}/${folder}/`)) throw new BadRequestException('Envie o arquivo pelo Votz')
    }
  }),
}
const reportMedia = { attach: jest.fn(async () => undefined) }
const posts = { createAdvocacyPost: jest.fn(async () => ({ id: 'post-1' })) }

const asOrg = (type: 'ENTITY' | 'POLITICIAN', id: string, userId = 'staff-1') => ({
  id: userId,
  type: 'CITIZEN',
  ctx: { type, id, name: id, logoUrl: null, permissions: [OrgPermission.RESPOND_REPORTS] },
})
const moderator = { id: 'mod-1', type: 'MODERATOR' }
const PHOTO = `${STORAGE}/reports/11111111-1111-4111-8111-111111111111.jpg`
const RESOLVE_TEXT = 'Equipe tapou o buraco na quarta-feira e liberou a rua.'

describe('ReportLifecycleService', () => {
  let state: State
  let db: any
  let service: ReportLifecycleService

  const setup = (report: Partial<Row> = {}) => {
    state = makeState(report)
    db = makeDb(state)
    service = new ReportLifecycleService(db, effects as any, storage as any, reportMedia as any, undefined, posts as any)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    setup()
  })

  // ── Mudar status ──────────────────────────────────────────────────────────

  describe('changeStatus', () => {
    it('destinatário muda o status e a Memória ganha o evento com a instituição', async () => {
      const res = await service.changeStatus('r1', asOrg('ENTITY', 'e1'), {
        status: UpdatableStatus.IN_PROGRESS,
        content: 'Equipe vai ao local amanhã.',
      })
      expect(res).toEqual({ id: 'r1', status: ReportStatus.IN_PROGRESS })
      expect(state.report!.status).toBe(ReportStatus.IN_PROGRESS)
      expect(state.report!.firstResponseAt).toBeInstanceOf(Date)
      expect(state.events).toHaveLength(1)
      expect(state.events[0]).toMatchObject({
        type: EventType.STATUS_CHANGED,
        metadata: expect.objectContaining({ previousStatus: 'OPEN', newStatus: 'IN_PROGRESS', orgType: 'ENTITY', orgId: 'e1', asRecipient: true }),
      })
      expect(effects.afterStatusChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'OPEN', 'IN_PROGRESS', 'staff-1', 'Prefeitura de São Paulo')
    })

    it('cidadão sem perfil de instituição não muda status', async () => {
      await expect(
        service.changeStatus('r1', { id: 'u1', type: 'CITIZEN' }, { status: UpdatableStatus.IN_PROGRESS, content: 'Tentando mudar.' }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('quem não recebeu o relato (mesmo tendo avocado) não muda status', async () => {
      state.advocacies.push({ reportId: 'r1', orgType: 'ENTITY', orgId: 'e2', closedAt: null })
      await expect(
        service.changeStatus('r1', asOrg('ENTITY', 'e2'), { status: UpdatableStatus.RESOLVED, content: RESOLVE_TEXT, media: [PHOTO] }),
      ).rejects.toThrow(/Só quem recebeu o relato pode mudar o status/)
      expect(state.report!.status).toBe(ReportStatus.OPEN)
      expect(state.events).toHaveLength(0)
    })

    it('político com mandato encerrado não age', async () => {
      setup({ recipientType: 'POLITICIAN', recipientId: 'pEnc' })
      await expect(
        service.changeStatus('r1', asOrg('POLITICIAN', 'pEnc'), { status: UpdatableStatus.IN_PROGRESS, content: 'Vou resolver isso.' }),
      ).rejects.toThrow(/mandato ativo/)
    })

    it.each([
      [ReportStatus.IN_PROGRESS, UpdatableStatus.UNDER_REVIEW, /Não é possível passar/],
      [ReportStatus.RESOLVED, UpdatableStatus.IN_PROGRESS, /já foi encerrado/],
      [ReportStatus.ARCHIVED, UpdatableStatus.UNDER_REVIEW, /já foi encerrado/],
      [ReportStatus.DISPUTED, UpdatableStatus.RESOLVED, /contestado/],
    ])('destinatário não passa de %s para %s', async (from, to, msg) => {
      setup({ status: from, resolvedAt: new Date() })
      await expect(
        service.changeStatus('r1', asOrg('ENTITY', 'e1'), { status: to, content: RESOLVE_TEXT, media: [PHOTO] }),
      ).rejects.toThrow(msg)
      expect(state.report!.status).toBe(from)
    })

    it('resolver exige explicação de 30 caracteres e prova (ou "sem foto ou documento")', async () => {
      const actor = asOrg('ENTITY', 'e1')
      await expect(
        service.changeStatus('r1', actor, { status: UpdatableStatus.RESOLVED, content: 'Resolvido, ok.', media: [PHOTO] }),
      ).rejects.toThrow(/30 caracteres/)
      await expect(
        service.changeStatus('r1', actor, { status: UpdatableStatus.RESOLVED, content: RESOLVE_TEXT }),
      ).rejects.toThrow(/anexe uma foto ou documento/)
      expect(state.report!.status).toBe(ReportStatus.OPEN)

      await service.changeStatus('r1', actor, { status: UpdatableStatus.RESOLVED, content: RESOLVE_TEXT, noEvidence: true })
      expect(state.report).toMatchObject({ status: ReportStatus.RESOLVED, resolvedWithoutEvidence: true, archivedAt: null })
      expect(state.report!.resolvedAt).toBeInstanceOf(Date)
      expect(state.events[0]).toMatchObject({ type: EventType.RESOLVED, metadata: expect.objectContaining({ withoutEvidence: true }) })
    })

    it('resolver com foto grava a prova e marca o arquivo como usado', async () => {
      await service.changeStatus('r1', asOrg('ENTITY', 'e1'), { status: UpdatableStatus.RESOLVED, content: RESOLVE_TEXT, media: [PHOTO] })
      expect(state.report!.resolvedWithoutEvidence).toBe(false)
      expect(state.events[0].metadata.media).toEqual([PHOTO])
      expect(reportMedia.attach).toHaveBeenCalledWith([PHOTO], 'staff-1')
    })

    it('arquivo de fora do Votz ou de outra pessoa barra a mudança ANTES de gravar', async () => {
      await expect(
        service.changeStatus('r1', asOrg('ENTITY', 'e1'), { status: UpdatableStatus.RESOLVED, content: RESOLVE_TEXT, media: ['https://evil.example/a.jpg'] }),
      ).rejects.toThrow(BadRequestException)
      reportMedia.attach.mockRejectedValueOnce(new ForbiddenException('Você só pode anexar arquivos que você mesmo enviou.'))
      await expect(
        service.changeStatus('r1', asOrg('ENTITY', 'e1'), { status: UpdatableStatus.RESOLVED, content: RESOLVE_TEXT, media: [PHOTO] }),
      ).rejects.toThrow(ForbiddenException)
      expect(state.report!.status).toBe(ReportStatus.OPEN)
      expect(state.events).toHaveLength(0)
    })

    it('arquivar exige motivo da lista e grava o motivo', async () => {
      const actor = asOrg('ENTITY', 'e1')
      await expect(
        service.changeStatus('r1', actor, { status: UpdatableStatus.ARCHIVED, content: 'Relato repetido de outro.' }),
      ).rejects.toThrow(/escolha o motivo/)
      await service.changeStatus('r1', actor, {
        status: UpdatableStatus.ARCHIVED,
        content: 'Relato repetido de outro.',
        archiveReason: ArchiveReason.DUPLICATE,
      })
      expect(state.report).toMatchObject({ status: ReportStatus.ARCHIVED, archiveReason: 'DUPLICATE', resolvedAt: null })
      expect(state.report!.archivedAt).toBeInstanceOf(Date)
      expect(state.events[0]).toMatchObject({ type: EventType.ARCHIVED, metadata: expect.objectContaining({ archiveReason: 'DUPLICATE' }) })
    })

    it('tela velha (status mudou no meio) recebe 409 e nada é gravado', async () => {
      db.report.updateMany.mockResolvedValueOnce({ count: 0 })
      await expect(
        service.changeStatus('r1', asOrg('ENTITY', 'e1'), { status: UpdatableStatus.IN_PROGRESS, content: 'Equipe vai ao local amanhã.' }),
      ).rejects.toThrow(ConflictException)
      expect(state.events).toHaveLength(0)
      expect(effects.afterStatusChange).not.toHaveBeenCalled()
    })

    it('moderação muda status sem contexto, mas não mexe em relato contestado', async () => {
      const res = await service.changeStatus('r1', moderator, { status: UpdatableStatus.UNDER_REVIEW, content: 'Ajuste da moderação.' })
      expect(res.status).toBe(ReportStatus.UNDER_REVIEW)
      expect(state.report!.firstResponseAt).toBeNull() // moderação não conta como resposta de quem recebeu
      expect(state.events[0].metadata).toMatchObject({ actorRole: 'MODERATION', administrative: true })

      setup({ status: ReportStatus.DISPUTED })
      await expect(
        service.changeStatus('r1', moderator, { status: UpdatableStatus.IN_PROGRESS, content: 'Ajuste da moderação.' }),
      ).rejects.toThrow(/decisão da contestação/)
    })

    it('relato oculto pela moderação não recebe ações', async () => {
      setup({ moderationStatus: 'HIDDEN' })
      await expect(
        service.changeStatus('r1', asOrg('ENTITY', 'e1'), { status: UpdatableStatus.IN_PROGRESS, content: 'Equipe vai ao local amanhã.' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ── Atualização sem trocar status ─────────────────────────────────────────

  describe('postUpdate', () => {
    it('texto de quem recebeu é resposta oficial e marca a primeira resposta', async () => {
      await service.postUpdate('r1', asOrg('ENTITY', 'e1'), { content: 'Recebemos e vamos verificar.' })
      expect(state.events[0]).toMatchObject({ type: EventType.RESPONDED, metadata: expect.objectContaining({ action: 'responded' }) })
      expect(state.report!.firstResponseAt).toBeInstanceOf(Date)
      expect(effects.afterUpdate).toHaveBeenCalledWith(expect.anything(), 'staff-1', true, 'Prefeitura de São Paulo')
    })

    it('quem avocou publica atualização, sem contar como resposta de quem recebeu', async () => {
      state.advocacies.push({ reportId: 'r1', orgType: 'POLITICIAN', orgId: 'p1', closedAt: null })
      await service.postUpdate('r1', asOrg('POLITICIAN', 'p1'), { content: 'Cobrei a secretaria hoje.' })
      expect(state.events[0]).toMatchObject({ type: EventType.UPDATE, metadata: expect.objectContaining({ politicianId: 'p1' }) })
      expect(state.report!.firstResponseAt).toBeNull()
    })

    it('quem não recebeu nem avocou não publica', async () => {
      await expect(service.postUpdate('r1', asOrg('POLITICIAN', 'p1'), { content: 'Cobrei a secretaria hoje.' })).rejects.toThrow(
        /Avoque o relato antes/,
      )
      // Avocação encerrada também não vale
      state.advocacies.push({ reportId: 'r1', orgType: 'POLITICIAN', orgId: 'p1', closedAt: new Date() })
      await expect(service.postUpdate('r1', asOrg('POLITICIAN', 'p1'), { content: 'Cobrei a secretaria hoje.' })).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('texto curto demais é recusado', async () => {
      await expect(service.postUpdate('r1', asOrg('ENTITY', 'e1'), { content: 'ok' })).rejects.toThrow(/10 caracteres/)
    })

    it('resposta durante a contestação fica marcada', async () => {
      setup({ status: ReportStatus.DISPUTED })
      await service.postUpdate('r1', asOrg('ENTITY', 'e1'), { content: 'Segue a foto do conserto feito.', media: [PHOTO] })
      expect(state.events[0].metadata).toMatchObject({ duringDispute: true, media: [PHOTO] })
    })
  })

  // ── Avocar ────────────────────────────────────────────────────────────────

  describe('advocate', () => {
    it('terceiro que avoca não muda status, prazo de resposta nem pressão sobre quem recebeu', async () => {
      const res = await service.advocate('r1', asOrg('POLITICIAN', 'p1'), { orgType: 'POLITICIAN', orgId: 'p1' }, { promisedInDays: 15 })
      expect(res).toEqual({ advocated: true })
      expect(state.report!.status).toBe(ReportStatus.OPEN)
      expect(state.report!.firstResponseAt).toBeNull()
      expect(state.advocacies).toHaveLength(1)
      expect(state.advocacies[0].promisedFor).toBeInstanceOf(Date)
      expect(db.reportFollower.upsert).toHaveBeenCalled()
      expect(state.events).toHaveLength(1)
      expect(state.events[0]).toMatchObject({
        type: EventType.RESPONDED,
        metadata: expect.objectContaining({ action: TIMELINE_ACTIONS.ADVOCATED, politicianId: 'p1', promisedFor: expect.any(String) }),
      })
      expect(effects.afterAdvocacy).toHaveBeenCalledWith(expect.anything(), 'staff-1', 'Vereadora Ana', false)
      expect(effects.afterStatusChange).not.toHaveBeenCalled()
    })

    it('destinatário que avoca relato aberto o coloca em andamento, com evento de status', async () => {
      await service.advocate('r1', asOrg('ENTITY', 'e1'), { orgType: 'ENTITY', orgId: 'e1' })
      expect(state.report!.status).toBe(ReportStatus.IN_PROGRESS)
      expect(state.report!.firstResponseAt).toBeInstanceOf(Date)
      expect(state.events.map((e) => e.type)).toEqual([EventType.RESPONDED, EventType.STATUS_CHANGED])
      expect(effects.afterStatusChange).toHaveBeenCalledWith(expect.anything(), 'OPEN', 'IN_PROGRESS', 'staff-1', 'Prefeitura de São Paulo')
    })

    it('não avoca duas vezes, e o conflito do banco (P2002) vira 409', async () => {
      state.advocacies.push({ reportId: 'r1', orgType: 'POLITICIAN', orgId: 'p1', closedAt: null })
      await expect(service.advocate('r1', asOrg('POLITICIAN', 'p1'), { orgType: 'POLITICIAN', orgId: 'p1' })).rejects.toThrow(
        ConflictException,
      )

      setup()
      db.reportAdvocacy.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: '5' }),
      )
      await expect(service.advocate('r1', asOrg('POLITICIAN', 'p1'), { orgType: 'POLITICIAN', orgId: 'p1' })).rejects.toThrow(
        ConflictException,
      )
    })

    it('quem desistiu pode avocar de novo (reativa o mesmo registro)', async () => {
      state.advocacies.push({ reportId: 'r1', orgType: 'POLITICIAN', orgId: 'p1', closedAt: new Date(), closedReason: 'WITHDRAWN' })
      await service.advocate('r1', asOrg('POLITICIAN', 'p1'), { orgType: 'POLITICIAN', orgId: 'p1' })
      expect(state.advocacies).toHaveLength(1)
      expect(state.advocacies[0]).toMatchObject({ closedAt: null, closedReason: null })
    })

    it.each([ReportStatus.RESOLVED, ReportStatus.ARCHIVED])('não avoca relato %s', async (status) => {
      setup({ status })
      await expect(service.advocate('r1', asOrg('POLITICIAN', 'p1'), { orgType: 'POLITICIAN', orgId: 'p1' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('avoca relato contestado (dá para assumir a cobrança de novo)', async () => {
      setup({ status: ReportStatus.DISPUTED })
      await expect(service.advocate('r1', asOrg('POLITICIAN', 'p1'), { orgType: 'POLITICIAN', orgId: 'p1' })).resolves.toEqual({ advocated: true })
      expect(state.report!.status).toBe(ReportStatus.DISPUTED)
    })

    it('território: vereador só na cidade, deputado no estado, entidade no estado', async () => {
      await expect(service.advocate('r1', asOrg('POLITICIAN', 'p3'), { orgType: 'POLITICIAN', orgId: 'p3' })).rejects.toThrow(
        /cidade do seu mandato/,
      )
      await expect(service.advocate('r1', asOrg('POLITICIAN', 'p4'), { orgType: 'POLITICIAN', orgId: 'p4' })).rejects.toThrow(
        /estado do seu mandato/,
      )
      await expect(service.advocate('r1', asOrg('ENTITY', 'eRJ'), { orgType: 'ENTITY', orgId: 'eRJ' })).rejects.toThrow(
        /estado da sua entidade/,
      )
      await expect(service.advocate('r1', asOrg('POLITICIAN', 'p2'), { orgType: 'POLITICIAN', orgId: 'p2' })).resolves.toEqual({ advocated: true })
      await expect(service.advocate('r1', asOrg('ENTITY', 'e2'), { orgType: 'ENTITY', orgId: 'e2' })).resolves.toEqual({ advocated: true })
    })

    it('contexto de outra organização é recusado (2FA/perfil ativo)', async () => {
      await expect(service.advocate('r1', asOrg('POLITICIAN', 'p2'), { orgType: 'POLITICIAN', orgId: 'p1' })).rejects.toThrow(
        ForbiddenException,
      )
      await expect(
        service.advocate('r1', { id: 'u1', type: 'POLITICIAN', ctx: null }, { orgType: 'POLITICIAN', orgId: 'p1' }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('com publishToFeed, cria o post de avocação', async () => {
      const res = await service.advocate('r1', asOrg('POLITICIAN', 'p1'), { orgType: 'POLITICIAN', orgId: 'p1' }, {
        publishToFeed: true,
        postContent: 'Assumi esse problema e vou cobrar.',
      })
      expect(res).toEqual({ advocated: true, postId: 'post-1' })
      expect(posts.createAdvocacyPost).toHaveBeenCalledWith(expect.objectContaining({ reportId: 'r1', orgType: 'POLITICIAN', orgId: 'p1' }))
    })
  })

  describe('withdrawAdvocacy', () => {
    it('desistência é pública, com motivo, e fica registrada', async () => {
      state.advocacies.push({ reportId: 'r1', orgType: 'POLITICIAN', orgId: 'p1', closedAt: null })
      await expect(service.withdrawAdvocacy('r1', asOrg('POLITICIAN', 'p1'), 'curto')).rejects.toThrow(/10 caracteres/)
      await service.withdrawAdvocacy('r1', asOrg('POLITICIAN', 'p1'), 'A prefeitura já assumiu a obra.')
      expect(state.advocacies[0]).toMatchObject({ closedReason: 'WITHDRAWN', closedNote: 'A prefeitura já assumiu a obra.' })
      expect(state.events[0]).toMatchObject({ type: EventType.UPDATE, metadata: expect.objectContaining({ action: 'advocacy_withdrawn' }) })
      expect(effects.afterAdvocacy).toHaveBeenCalledWith(expect.anything(), 'staff-1', 'Vereadora Ana', true)
    })

    it('sem avocação ativa, não há o que desistir', async () => {
      await expect(service.withdrawAdvocacy('r1', asOrg('POLITICIAN', 'p1'), 'A prefeitura já assumiu a obra.')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  // ── Contestação ───────────────────────────────────────────────────────────

  describe('dispute', () => {
    const reason = { reason: 'O buraco continua lá, igualzinho.' }
    const resolvedRecently = () => ({ status: ReportStatus.RESOLVED, resolvedAt: new Date(Date.now() - 2 * DAY) })

    it('autor contesta resolução dentro de 30 dias', async () => {
      setup(resolvedRecently())
      const res = await service.dispute('r1', { ...reason, evidence: [PHOTO] }, 'author-1')
      expect(res).toEqual({ id: 'r1', status: ReportStatus.DISPUTED })
      expect(state.events[0]).toMatchObject({
        type: EventType.DISPUTED,
        authorId: 'author-1',
        metadata: expect.objectContaining({ previousStatus: 'RESOLVED', disputedBy: 'AUTHOR', disputerUserId: 'author-1', evidence: [PHOTO] }),
      })
      expect(effects.afterDispute).toHaveBeenCalledWith(expect.anything(), 'RESOLVED', 'author-1')
    })

    it('quem marcou "Eu também" contesta; quem só apoiou não', async () => {
      setup(resolvedRecently())
      await expect(service.dispute('r1', reason, 'stranger')).rejects.toThrow(/Eu também/)
      state.meToo.push('neighbor')
      await service.dispute('r1', reason, 'neighbor')
      expect(state.events[0].metadata.disputedBy).toBe('ME_TOO')
    })

    it('relato anônimo: a contestação é gravada sem nome', async () => {
      setup({ ...resolvedRecently(), anonymous: true })
      await service.dispute('r1', reason, 'author-1')
      expect(state.events[0].authorId).toBeNull()
      expect(state.events[0].metadata.disputerUserId).toBe('author-1')
    })

    it('arquivamento também pode ser contestado', async () => {
      setup({ status: ReportStatus.ARCHIVED, archivedAt: new Date(Date.now() - DAY) })
      await service.dispute('r1', reason, 'author-1')
      expect(state.report!.status).toBe(ReportStatus.DISPUTED)
      expect(state.events[0].metadata.previousStatus).toBe('ARCHIVED')
    })

    it('fora do prazo, aberto, ou já contestado: recusa', async () => {
      setup({ status: ReportStatus.RESOLVED, resolvedAt: new Date(Date.now() - 31 * DAY) })
      await expect(service.dispute('r1', reason, 'author-1')).rejects.toThrow(/30 dias/)

      setup({ status: ReportStatus.IN_PROGRESS })
      await expect(service.dispute('r1', reason, 'author-1')).rejects.toThrow(/resolvido ou arquivado/)

      setup(resolvedRecently())
      state.events.push({ type: EventType.DISPUTED, createdAt: new Date(Date.now() - DAY) })
      await expect(service.dispute('r1', reason, 'author-1')).rejects.toThrow(/já foi contestada/)
    })

    it('nova resolução depois de reabrir permite nova contestação', async () => {
      setup({ status: ReportStatus.RESOLVED, resolvedAt: new Date() })
      // Contestação antiga, de antes da resolução atual
      state.events.push({ type: EventType.DISPUTED, createdAt: new Date(Date.now() - 10 * DAY) })
      await expect(service.dispute('r1', reason, 'author-1')).resolves.toEqual({ id: 'r1', status: ReportStatus.DISPUTED })
    })

    it('texto curto e prova de fora do Votz são recusados antes de gravar', async () => {
      setup(resolvedRecently())
      await expect(service.dispute('r1', { reason: 'não' }, 'author-1')).rejects.toThrow(/20 caracteres/)
      await expect(service.dispute('r1', { ...reason, evidence: ['https://evil.example/x.jpg'] }, 'author-1')).rejects.toThrow(
        BadRequestException,
      )
      expect(state.report!.status).toBe(ReportStatus.RESOLVED)
    })

    it('dois cliques ao mesmo tempo: o segundo recebe 409', async () => {
      setup(resolvedRecently())
      db.report.updateMany.mockResolvedValueOnce({ count: 0 })
      await expect(service.dispute('r1', reason, 'author-1')).rejects.toThrow(ConflictException)
    })
  })

  describe('resolveDispute', () => {
    const justification = { justification: 'As fotos mostram o buraco ainda aberto na rua.' }

    const disputed = (previousStatus: string) => {
      setup({ status: ReportStatus.DISPUTED, resolvedAt: new Date(Date.now() - DAY), resolvedWithoutEvidence: true })
      state.events.push({ type: EventType.DISPUTED, createdAt: new Date(), metadata: { previousStatus, disputerUserId: 'neighbor' } })
    }

    it('só a moderação decide', async () => {
      disputed('RESOLVED')
      await expect(
        service.resolveDispute('r1', { decision: DisputeResolution.REOPEN, ...justification }, { id: 'u1', type: 'CITIZEN' }),
      ).rejects.toThrow(ForbiddenException)
      await expect(
        service.resolveDispute('r1', { decision: DisputeResolution.REOPEN, ...justification }, { id: 'u1', type: 'ENTITY' }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('REOPEN reabre e apaga as datas de encerramento', async () => {
      disputed('RESOLVED')
      const res = await service.resolveDispute('r1', { decision: DisputeResolution.REOPEN, ...justification }, moderator)
      expect(res.status).toBe(ReportStatus.OPEN)
      expect(state.report).toMatchObject({ status: 'OPEN', resolvedAt: null, archivedAt: null, resolvedWithoutEvidence: false })
      const decision = state.events[state.events.length - 1]
      expect(decision).toMatchObject({
        type: EventType.STATUS_CHANGED,
        metadata: expect.objectContaining({ action: 'dispute_decided', decision: 'REOPEN', actorRole: 'MODERATION' }),
      })
      expect(effects.afterDisputeDecision).toHaveBeenCalledWith(expect.anything(), 'REOPEN', 'OPEN', 'mod-1', 'neighbor')
    })

    it('UPHOLD volta para o encerramento anterior (resolvido ou arquivado), mantendo a data', async () => {
      disputed('RESOLVED')
      const resolvedAt = state.report!.resolvedAt
      await service.resolveDispute('r1', { decision: DisputeResolution.UPHOLD, ...justification }, moderator)
      expect(state.report).toMatchObject({ status: 'RESOLVED', resolvedAt })

      disputed('ARCHIVED')
      const res = await service.resolveDispute('r1', { decision: DisputeResolution.UPHOLD, ...justification }, moderator)
      expect(res.status).toBe(ReportStatus.ARCHIVED)
    })

    it('relato que não está contestado e justificativa curta são recusados', async () => {
      await expect(service.resolveDispute('r1', { decision: DisputeResolution.UPHOLD, ...justification }, moderator)).rejects.toThrow(
        /não está contestado/,
      )
      disputed('RESOLVED')
      await expect(
        service.resolveDispute('r1', { decision: DisputeResolution.UPHOLD, justification: 'ok' }, moderator),
      ).rejects.toThrow(/20 caracteres/)
    })
  })

  describe('confirmResolution', () => {
    it('autor confirma uma vez; outros não podem', async () => {
      setup({ status: ReportStatus.RESOLVED, resolvedAt: new Date() })
      await expect(service.confirmResolution('r1', 'neighbor')).rejects.toThrow(ForbiddenException)
      const res = await service.confirmResolution('r1', 'author-1')
      expect(res.resolutionConfirmedAt).toBeInstanceOf(Date)
      expect(state.events[0].metadata.action).toBe('resolution_confirmed')
      await expect(service.confirmResolution('r1', 'author-1')).rejects.toThrow(ConflictException)
    })

    it('só confirma relato resolvido', async () => {
      await expect(service.confirmResolution('r1', 'author-1')).rejects.toThrow(BadRequestException)
    })
  })

  describe('disputeQueue', () => {
    it('só a moderação vê a fila', async () => {
      await expect(service.disputeQueue({ type: 'CITIZEN' })).rejects.toThrow(ForbiddenException)
    })

    it('monta a fila com contestação, encerramento e respostas depois, sem o id de quem contestou', async () => {
      const t = (d: number) => new Date(Date.now() - d * DAY)
      db.report.count = jest.fn(async () => 1)
      db.report.findMany = jest.fn(async () => [
        {
          id: 'r1',
          title: 'Buraco',
          category: 'INFRASTRUCTURE',
          city: 'São Paulo',
          state: 'SP',
          recipientType: 'ENTITY',
          recipientId: 'e1',
          resolvedWithoutEvidence: true,
          archiveReason: null,
          timeline: [
            { id: 'a', type: EventType.RESPONDED, content: 'Segue foto.', metadata: {}, createdAt: t(1) },
            { id: 'b', type: EventType.DISPUTED, content: 'Continua.', metadata: { disputerUserId: 'x', disputedBy: 'AUTHOR' }, createdAt: t(3) },
            { id: 'c', type: EventType.RESOLVED, content: 'Feito.', metadata: {}, createdAt: t(5) },
          ],
        },
      ])
      const res = await service.disputeQueue(moderator)
      expect(res.meta.total).toBe(1)
      const item = res.data[0]
      expect(item.recipientName).toBe('Prefeitura de São Paulo')
      expect(item.waitingDays).toBe(3)
      expect(item.dispute?.metadata).toEqual({ disputedBy: 'AUTHOR' })
      expect(item.closing?.content).toBe('Feito.')
      expect(item.repliesAfterDispute.map((r) => r.id)).toEqual(['a'])
    })
  })

  describe('updateFromReportPage', () => {
    it('sem status publica atualização; com status muda o status', async () => {
      await service.updateFromReportPage('r1', { content: 'Recebemos e vamos verificar.' }, asOrg('ENTITY', 'e1'))
      expect(state.events[0].type).toBe(EventType.RESPONDED)
      await service.updateFromReportPage('r1', { status: UpdatableStatus.IN_PROGRESS, content: 'Equipe a caminho.' }, asOrg('ENTITY', 'e1'))
      expect(state.report!.status).toBe(ReportStatus.IN_PROGRESS)
    })
  })
})

describe('checkDisputeWindow', () => {
  const now = new Date('2026-11-27T12:00:00Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY)

  it('aceita dentro de 30 dias e devolve o prazo', () => {
    const res = checkDisputeWindow({ status: 'RESOLVED', resolvedAt: daysAgo(29), archivedAt: null, disputeDates: [], now })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.deadline.getTime()).toBe(daysAgo(29).getTime() + 30 * DAY)
  })

  it('recusa depois de 30 dias, relato aberto e resolução já contestada', () => {
    expect(checkDisputeWindow({ status: 'RESOLVED', resolvedAt: daysAgo(31), archivedAt: null, now })).toMatchObject({ ok: false, reason: 'WINDOW_EXPIRED' })
    expect(checkDisputeWindow({ status: 'OPEN', resolvedAt: null, archivedAt: null, now })).toMatchObject({ ok: false, reason: 'NOT_CLOSED' })
    expect(
      checkDisputeWindow({ status: 'ARCHIVED', resolvedAt: null, archivedAt: daysAgo(5), disputeDates: [daysAgo(2)], now }),
    ).toMatchObject({ ok: false, reason: 'ALREADY_DISPUTED' })
  })

  it('contestação antiga, de antes da resolução atual, não conta', () => {
    expect(checkDisputeWindow({ status: 'RESOLVED', resolvedAt: daysAgo(1), archivedAt: null, disputeDates: [daysAgo(10)], now }).ok).toBe(true)
  })
})
