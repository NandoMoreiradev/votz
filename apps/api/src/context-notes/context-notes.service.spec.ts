jest.mock('isomorphic-dompurify', () => ({
  sanitize: (s: string) => s.replace(/<[^>]*>/g, ''),
}))

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ContextNoteKind, ContextNoteRatingValue as V, ContextNoteStatus as S, NotificationType, UserType } from '@prisma/client'
import { CONTEXT_CONTRIBUTOR_TERMS_VERSION, ContextNoteTargetType } from '@votz/shared-types'
import { ContextNotesService } from './context-notes.service'

const OLD = new Date('2026-01-01T00:00:00Z')
const GOOD_TEXT = 'A obra citada foi entregue em 2024, conforme o diário oficial do município.'
const SOURCE = 'https://www.exemplo.gov.br/diario/2024-03'
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function build(enabled = true) {
  const repo = {
    findPostTarget: jest.fn(),
    findReportTarget: jest.fn(),
    findBranchCompanyId: jest.fn(),
    isActiveOrgMember: jest.fn().mockResolvedValue(false),
    findUserForEligibility: jest.fn().mockResolvedValue({ id: U(1), type: UserType.CITIZEN, banned: false, emailVerified: true, ageConfirmedAt: OLD, createdAt: OLD }),
    findContributor: jest.fn().mockResolvedValue({ userId: U(1), ratingsGiven: 6, ratingsResolved: 0, ratingsAligned: 0, writeGrantedAt: null, suspendedAt: null }),
    createContributor: jest.fn().mockResolvedValue({}),
    grantWrite: jest.fn(),
    setSuspended: jest.fn(),
    createNote: jest.fn().mockResolvedValue({ id: U(100), kind: ContextNoteKind.CORRECTION, text: GOOD_TEXT, sources: [SOURCE], status: S.NEEDS_RATINGS, createdAt: new Date() }),
    findNoteById: jest.fn(),
    findLiveNoteByAuthorAndTarget: jest.fn().mockResolvedValue(null),
    countNotesByAuthorSince: jest.fn().mockResolvedValue(0),
    upsertRating: jest.fn().mockResolvedValue({ created: true }),
    createRequest: jest.fn().mockResolvedValue({ id: 'r' }),
    countRequestsByUserSince: jest.fn().mockResolvedValue(0),
    findShown: jest.fn().mockResolvedValue([]),
    findNotesToRate: jest.fn().mockResolvedValue([]),
    findRequestedTargets: jest.fn().mockResolvedValue({ posts: [], reports: [] }),
    findNotesForEvaluation: jest.fn(),
    tallies: jest.fn(),
    applyEvaluation: jest.fn().mockResolvedValue(undefined),
    findRatingsOfNote: jest.fn().mockResolvedValue([]),
    removeNote: jest.fn(),
    findUserContact: jest.fn().mockResolvedValue({ email: 'a@b.c', name: 'Ana' }),
    listForAdmin: jest.fn(),
  }
  const config = { get: jest.fn().mockReturnValue(enabled ? 'true' : undefined) }
  const notifications = { notify: jest.fn().mockResolvedValue({}) }
  const mail = { sendModerationNotice: jest.fn().mockResolvedValue(true) }
  const prisma = { moderationAction: { update: jest.fn().mockResolvedValue({}) } }
  const service = new ContextNotesService(repo as never, config as never, notifications as never, mail as never, prisma as never)
  return { service, repo, notifications, mail, prisma }
}

const post = (authorUserId = U(9)) => ({ id: U(50), authorUserId, authorOrgType: null, authorOrgId: null })
const report = (over: Record<string, unknown> = {}) => ({ id: U(60), authorId: U(9), anonymous: false, recipientType: null, recipientId: null, ...over })
const createDto = (over: Record<string, unknown> = {}) =>
  ({ targetType: ContextNoteTargetType.POST, targetId: U(50), kind: ContextNoteKind.CORRECTION, text: GOOD_TEXT, sources: [SOURCE], ...over }) as never

describe('ContextNotesService', () => {
  describe('chave de liberação', () => {
    it('com o recurso desligado, nada funciona e a leitura vem vazia', async () => {
      const { service } = build(false)
      await expect(service.createNote(U(1), createDto())).rejects.toBeInstanceOf(NotFoundException)
      await expect(service.requestContext({ id: U(1), emailVerified: true }, { targetType: ContextNoteTargetType.POST, targetId: U(50) })).rejects.toBeInstanceOf(NotFoundException)
      expect(await service.listShown(U(50))).toEqual({ enabled: false, POST: {}, REPORT: {} })
    })
  })

  describe('entrar como colaborador', () => {
    it('exige a versão atual do termo', async () => {
      const { service } = build()
      await expect(service.joinAsContributor(U(1), { acceptTerms: true, termsVersion: 'velha' })).rejects.toBeInstanceOf(BadRequestException)
    })
    it('aceita quem cumpre os requisitos', async () => {
      const { service, repo } = build()
      await service.joinAsContributor(U(1), { acceptTerms: true, termsVersion: CONTRIBUTOR_VERSION })
      expect(repo.createContributor).toHaveBeenCalledWith(U(1), CONTRIBUTOR_VERSION)
    })
    it.each([
      ['conta nova', { createdAt: new Date() }],
      ['e-mail não confirmado', { emailVerified: false }],
      ['sem confirmar os 18 anos', { ageConfirmedAt: null }],
      ['conta banida', { banned: true }],
      ['conta de político', { type: UserType.POLITICIAN }],
      ['conta de empresa', { type: UserType.COMPANY }],
      ['moderador', { type: UserType.MODERATOR }],
    ])('recusa: %s', async (_name, patch) => {
      const { service, repo } = build()
      repo.findUserForEligibility.mockResolvedValue({ id: U(1), type: UserType.CITIZEN, banned: false, emailVerified: true, ageConfirmedAt: OLD, createdAt: OLD, ...patch })
      await expect(service.joinAsContributor(U(1), { acceptTerms: true, termsVersion: CONTRIBUTOR_VERSION })).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.createContributor).not.toHaveBeenCalled()
    })
  })

  describe('escrever nota', () => {
    it('cria a nota de uma publicação com fonte', async () => {
      const { service, repo } = build()
      repo.findPostTarget.mockResolvedValue(post())
      const view = await service.createNote(U(1), createDto())
      expect(repo.createNote).toHaveBeenCalledWith(expect.objectContaining({ target: { postId: U(50) }, authorId: U(1), sources: [SOURCE] }))
      expect(view.id).toBe(U(100))
    })
    it('exige entrar como colaborador antes', async () => {
      const { service, repo } = build()
      repo.findContributor.mockResolvedValue(null)
      await expect(service.createNote(U(1), createDto())).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('exige avaliar antes de escrever', async () => {
      const { service, repo } = build()
      repo.findContributor.mockResolvedValue({ userId: U(1), ratingsGiven: 2, ratingsResolved: 0, ratingsAligned: 0, writeGrantedAt: null, suspendedAt: null })
      repo.findPostTarget.mockResolvedValue(post())
      await expect(service.createNote(U(1), createDto())).rejects.toThrow(/avalie pelo menos 5/)
    })
    it('colaborador suspenso não escreve', async () => {
      const { service, repo } = build()
      repo.findContributor.mockResolvedValue({ userId: U(1), ratingsGiven: 9, ratingsResolved: 0, ratingsAligned: 0, writeGrantedAt: null, suspendedAt: new Date() })
      await expect(service.createNote(U(1), createDto())).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('relato NUNCA recebe "corrige" nem "falta contexto" (suspeita de relato falso vai pela denúncia)', async () => {
      const { service, repo } = build()
      repo.findReportTarget.mockResolvedValue(report())
      await expect(service.createNote(U(1), createDto({ targetType: ContextNoteTargetType.REPORT, targetId: U(60), kind: ContextNoteKind.CORRECTION }))).rejects.toThrow(/Denunciar/)
      expect(repo.createNote).not.toHaveBeenCalled()
    })
    it('relato aceita prova adicional', async () => {
      const { service, repo } = build()
      repo.findReportTarget.mockResolvedValue(report())
      await service.createNote(U(1), createDto({ targetType: ContextNoteTargetType.REPORT, targetId: U(60), kind: ContextNoteKind.EXTRA_EVIDENCE }))
      expect(repo.createNote).toHaveBeenCalledWith(expect.objectContaining({ target: { reportId: U(60) } }))
    })
    it('relato anônimo aceita nota e não procura autor', async () => {
      const { service, repo } = build()
      repo.findReportTarget.mockResolvedValue(report({ authorId: null, anonymous: true }))
      await service.createNote(U(1), createDto({ targetType: ContextNoteTargetType.REPORT, targetId: U(60), kind: ContextNoteKind.UPDATE }))
      expect(repo.createNote).toHaveBeenCalled()
    })
    it('o autor do conteúdo não escreve nota sobre ele', async () => {
      const { service, repo } = build()
      repo.findPostTarget.mockResolvedValue(post(U(1)))
      await expect(service.createNote(U(1), createDto())).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('membro do órgão alvo do relato não escreve nota sobre ele', async () => {
      const { service, repo } = build()
      repo.findReportTarget.mockResolvedValue(report({ recipientType: 'ENTITY', recipientId: U(70) }))
      repo.isActiveOrgMember.mockResolvedValue(true)
      await expect(service.createNote(U(1), createDto({ targetType: ContextNoteTargetType.REPORT, targetId: U(60), kind: ContextNoteKind.UPDATE }))).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.isActiveOrgMember).toHaveBeenCalledWith(U(1), 'ENTITY', U(70))
    })
    it('relato para uma filial confere os membros da empresa dona', async () => {
      const { service, repo } = build()
      repo.findReportTarget.mockResolvedValue(report({ recipientType: 'BRANCH', recipientId: U(71) }))
      repo.findBranchCompanyId.mockResolvedValue(U(72))
      repo.isActiveOrgMember.mockResolvedValue(true)
      await expect(service.createNote(U(1), createDto({ targetType: ContextNoteTargetType.REPORT, targetId: U(60), kind: ContextNoteKind.UPDATE }))).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.isActiveOrgMember).toHaveBeenCalledWith(U(1), 'COMPANY', U(72))
    })
    it('recusa fonte inválida, tira tags do texto e não grava', async () => {
      const { service, repo } = build()
      repo.findPostTarget.mockResolvedValue(post())
      await expect(service.createNote(U(1), createDto({ sources: ['javascript:alert(1)'] }))).rejects.toBeInstanceOf(BadRequestException)
      expect(repo.createNote).not.toHaveBeenCalled()
      await service.createNote(U(1), createDto({ text: `<b>${GOOD_TEXT}</b>` }))
      expect(repo.createNote.mock.calls[0][0].text).toBe(GOOD_TEXT)
    })
    it('só uma nota viva por autor e conteúdo', async () => {
      const { service, repo } = build()
      repo.findPostTarget.mockResolvedValue(post())
      repo.findLiveNoteByAuthorAndTarget.mockResolvedValue({ id: 'x' })
      await expect(service.createNote(U(1), createDto())).rejects.toBeInstanceOf(ConflictException)
    })
    it('respeita o limite de notas por dia', async () => {
      const { service, repo } = build()
      repo.findPostTarget.mockResolvedValue(post())
      repo.countNotesByAuthorSince.mockResolvedValue(5)
      await expect(service.createNote(U(1), createDto())).rejects.toThrow(/limite/)
    })
  })

  describe('avaliar nota', () => {
    const note = (over: Record<string, unknown> = {}) => ({
      id: U(100), postId: U(50), reportId: null, authorId: U(2), status: S.NEEDS_RATINGS, text: GOOD_TEXT,
      post: { authorUserId: U(9), authorOrgType: null, authorOrgId: null }, report: null, author: null, ...over,
    })
    it('grava a avaliação com motivos do lado certo', async () => {
      const { service, repo } = build()
      repo.findNoteById.mockResolvedValue(note())
      await service.rateNote(U(1), U(100), { value: V.HELPFUL, reasons: ['GOOD_SOURCES', 'CLEAR'] })
      expect(repo.upsertRating).toHaveBeenCalledWith(U(100), U(1), V.HELPFUL, ['GOOD_SOURCES', 'CLEAR'])
    })
    it('recusa motivo que não combina com a avaliação', async () => {
      const { service, repo } = build()
      repo.findNoteById.mockResolvedValue(note())
      await expect(service.rateNote(U(1), U(100), { value: V.HELPFUL, reasons: ['OPINION'] })).rejects.toBeInstanceOf(BadRequestException)
      await expect(service.rateNote(U(1), U(100), { value: V.NOT_HELPFUL, reasons: ['GOOD_SOURCES'] })).rejects.toBeInstanceOf(BadRequestException)
      await expect(service.rateNote(U(1), U(100), { value: V.HELPFUL, reasons: ['INVENTADO'] })).rejects.toBeInstanceOf(BadRequestException)
    })
    it('o autor da nota não avalia a própria nota', async () => {
      const { service, repo } = build()
      repo.findNoteById.mockResolvedValue(note({ authorId: U(1) }))
      await expect(service.rateNote(U(1), U(100), { value: V.HELPFUL })).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('o autor da publicação não avalia nota sobre ela', async () => {
      const { service, repo } = build()
      repo.findNoteById.mockResolvedValue(note({ post: { authorUserId: U(1), authorOrgType: null, authorOrgId: null } }))
      await expect(service.rateNote(U(1), U(100), { value: V.HELPFUL })).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('nota removida some para quem avalia', async () => {
      const { service, repo } = build()
      repo.findNoteById.mockResolvedValue(note({ status: S.REMOVED }))
      await expect(service.rateNote(U(1), U(100), { value: V.HELPFUL })).rejects.toBeInstanceOf(NotFoundException)
    })
    it('avaliar de novo troca a avaliação', async () => {
      const { service, repo } = build()
      repo.findNoteById.mockResolvedValue(note())
      repo.upsertRating.mockResolvedValue({ created: false })
      expect(await service.rateNote(U(1), U(100), { value: V.SOMEWHAT })).toEqual({ rated: true, changed: true })
    })
  })

  describe('pedir contexto', () => {
    const user = { id: U(1), emailVerified: true }
    it('registra o pedido', async () => {
      const { service, repo } = build()
      repo.findPostTarget.mockResolvedValue(post())
      await service.requestContext(user, { targetType: ContextNoteTargetType.POST, targetId: U(50) })
      expect(repo.createRequest).toHaveBeenCalledWith(U(1), { postId: U(50) })
    })
    it('exige e-mail confirmado e recusa pedido no próprio conteúdo', async () => {
      const { service, repo } = build()
      await expect(service.requestContext({ id: U(1), emailVerified: false }, { targetType: ContextNoteTargetType.POST, targetId: U(50) })).rejects.toBeInstanceOf(ForbiddenException)
      repo.findPostTarget.mockResolvedValue(post(U(1)))
      await expect(service.requestContext(user, { targetType: ContextNoteTargetType.POST, targetId: U(50) })).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('pedido repetido vira conflito amigável', async () => {
      const { service, repo } = build()
      repo.findPostTarget.mockResolvedValue(post())
      repo.createRequest.mockRejectedValue({ code: 'P2002' })
      await expect(service.requestContext(user, { targetType: ContextNoteTargetType.POST, targetId: U(50) })).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('leitura das notas exibidas', () => {
    it('devolve uma nota por conteúdo, a melhor primeiro, e ignora ids inválidos', async () => {
      const { service, repo } = build()
      repo.findShown.mockResolvedValue([
        { id: 'n1', postId: U(50), reportId: null, kind: S.SHOWN, text: 'melhor', sources: [SOURCE], origin: 'HUMAN', shownAt: new Date('2026-11-23T10:00:00Z') },
        { id: 'n2', postId: U(50), reportId: null, kind: S.SHOWN, text: 'pior', sources: [SOURCE], origin: 'HUMAN', shownAt: null },
        { id: 'n3', postId: null, reportId: U(60), kind: S.SHOWN, text: 'do relato', sources: [SOURCE], origin: 'HUMAN', shownAt: null },
      ])
      const out = await service.listShown(`${U(50)},não-é-uuid`, U(60))
      expect(repo.findShown).toHaveBeenCalledWith([U(50)], [U(60)])
      expect(out.POST[U(50)].text).toBe('melhor')
      expect(out.REPORT[U(60)].text).toBe('do relato')
    })
  })

  describe('conta de hora em hora', () => {
    const base = (over: Record<string, unknown> = {}) => ({
      id: U(100), status: S.NEEDS_RATINGS, ratingsCount: 0, helpfulShare: null, badStreak: 0, shownAt: null,
      postId: U(50), reportId: null, post: { authorUserId: U(9) }, report: null, ...over,
    })
    const tally = (h: number, s: number, n: number) => new Map([[U(100), { HELPFUL: h, SOMEWHAT: s, NOT_HELPFUL: n }]])

    it('exibe a nota com 7 avaliações e 70% útil, registra quem acertou e avisa o autor da publicação', async () => {
      const { service, repo, notifications } = build()
      repo.findNotesForEvaluation.mockResolvedValue([base()])
      repo.tallies.mockResolvedValue(tally(6, 0, 1)) // 6/7 = 0,857
      repo.findRatingsOfNote.mockResolvedValue([
        { raterId: U(11), value: V.HELPFUL },
        { raterId: U(12), value: V.NOT_HELPFUL },
      ])
      const result = await service.recalculateAll()
      expect(result).toMatchObject({ evaluated: 1, changed: 1, shown: 1 })
      expect(repo.applyEvaluation).toHaveBeenCalledWith(expect.objectContaining({
        noteId: U(100), from: S.NEEDS_RATINGS, to: S.SHOWN, ratingsCount: 7, firstResolution: true,
        alignedRaterIds: [U(11)], misalignedRaterIds: [U(12)],
      }))
      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: U(9), type: NotificationType.CONTEXT_NOTE_SHOWN }))
    })
    it('relato anônimo exibe a nota sem avisar ninguém', async () => {
      const { service, repo, notifications } = build()
      repo.findNotesForEvaluation.mockResolvedValue([base({ postId: null, reportId: U(60), post: null, report: { authorId: null, anonymous: true } })])
      repo.tallies.mockResolvedValue(tally(7, 0, 0))
      await service.recalculateAll()
      expect(repo.applyEvaluation).toHaveBeenCalledWith(expect.objectContaining({ to: S.SHOWN }))
      expect(notifications.notify).not.toHaveBeenCalled()
    })
    it('não avisa de novo uma nota que já tinha sido exibida antes', async () => {
      const { service, repo, notifications } = build()
      repo.findNotesForEvaluation.mockResolvedValue([base({ status: S.NOT_SHOWN, shownAt: new Date('2026-11-01T00:00:00Z'), ratingsCount: 9, helpfulShare: 0.5 })])
      repo.tallies.mockResolvedValue(tally(9, 0, 1))
      await service.recalculateAll()
      expect(notifications.notify).not.toHaveBeenCalled()
      expect(repo.applyEvaluation).toHaveBeenCalledWith(expect.objectContaining({ to: S.SHOWN, firstResolution: false }))
    })
    it('não mexe em nota que não mudou', async () => {
      const { service, repo } = build()
      repo.findNotesForEvaluation.mockResolvedValue([base({ ratingsCount: 3, helpfulShare: 1 })])
      repo.tallies.mockResolvedValue(tally(3, 0, 0))
      const result = await service.recalculateAll()
      expect(result.changed).toBe(0)
      expect(repo.applyEvaluation).not.toHaveBeenCalled()
    })
    it('falha ao avisar não derruba a conta', async () => {
      const { service, repo, notifications } = build()
      repo.findNotesForEvaluation.mockResolvedValue([base()])
      repo.tallies.mockResolvedValue(tally(7, 0, 0))
      notifications.notify.mockRejectedValue(new Error('redis fora'))
      await expect(service.recalculateAll()).resolves.toMatchObject({ shown: 1 })
    })
  })

  describe('moderação', () => {
    it('remove a nota com motivo, grava a ação e avisa quem escreveu por e-mail', async () => {
      const { service, repo, mail, prisma } = build()
      repo.removeNote.mockResolvedValue({ actionId: 'act1', authorId: U(2) })
      await service.removeByModeration(U(100), U(5), 'A nota acusa a pessoa de crime, sem fonte.')
      await new Promise((resolve) => setImmediate(resolve)) // o aviso corre em segundo plano
      expect(repo.removeNote).toHaveBeenCalledWith(U(100), U(5), 'A nota acusa a pessoa de crime, sem fonte.')
      expect(mail.sendModerationNotice).toHaveBeenCalledWith('a@b.c', 'Ana', 'NOTE_REMOVED', 'A nota acusa a pessoa de crime, sem fonte.')
      expect(prisma.moderationAction.update).toHaveBeenCalledWith({ where: { id: 'act1' }, data: { notifiedAt: expect.any(Date) } })
    })
    it('exige motivo e falha se a nota não existe', async () => {
      const { service, repo } = build()
      await expect(service.removeByModeration(U(100), U(5), 'curto')).rejects.toBeInstanceOf(BadRequestException)
      repo.removeNote.mockResolvedValue(null)
      await expect(service.removeByModeration(U(100), U(5), 'Motivo bem explicado aqui.')).rejects.toBeInstanceOf(NotFoundException)
    })
    it('e-mail lento ou com falha não trava nem desfaz a remoção', async () => {
      const { service, repo, mail } = build()
      repo.removeNote.mockResolvedValue({ actionId: 'act3', authorId: U(2) })
      mail.sendModerationNotice.mockReturnValue(new Promise(() => {})) // nunca responde
      await expect(service.removeByModeration(U(100), U(5), 'Motivo bem explicado aqui.')).resolves.toEqual({ removed: true })
      mail.sendModerationNotice.mockRejectedValue(new Error('SMTP fora'))
      await expect(service.removeByModeration(U(100), U(5), 'Motivo bem explicado aqui.')).resolves.toEqual({ removed: true })
    })
    it('nota de IA (sem autor) é removida sem e-mail', async () => {
      const { service, repo, mail } = build()
      repo.removeNote.mockResolvedValue({ actionId: 'act2', authorId: null })
      await service.removeByModeration(U(100), U(5), 'Motivo bem explicado aqui.')
      expect(mail.sendModerationNotice).not.toHaveBeenCalled()
    })
  })
})

const CONTRIBUTOR_VERSION = CONTEXT_CONTRIBUTOR_TERMS_VERSION
