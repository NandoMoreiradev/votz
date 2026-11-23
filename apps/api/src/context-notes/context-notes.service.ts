import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ContextNoteRatingValue, ContextNoteStatus, NotificationType, OrgType, RecipientType, UserType } from '@prisma/client'
import * as DOMPurify from 'isomorphic-dompurify'
import {
  CONTEXT_CONTRIBUTOR_TERMS_VERSION,
  CONTEXT_NOTE_RATING_REASONS,
  ContextNoteTargetType,
  type ContextNoteView,
} from '@votz/shared-types'
import { deliverModerationNotice } from '../common/moderation.helper'
import { MailService } from '../mail/mail.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PrismaService } from '../prisma/prisma.service'
import { CreateContextNoteDto, ContextNoteTargetDto, JoinContributorDto, RateContextNoteDto } from './dto/context-notes.dto'
import { ContextNotesRepository, NoteTarget, NoteWithPreview } from './context-notes.repository'
import {
  RULES,
  accountOldEnough,
  canWriteNotes,
  checkDraft,
  emptyTally,
  evaluateNote,
  helpfulShare,
  isAligned,
  kindAllowedFor,
  tallyCount,
} from './context-notes.rules'

/** Tipos de conta que podem colaborar. Órgãos, políticos, empresas e a equipe do Votz ficam de fora por conflito de interesse. */
const CONTRIBUTOR_TYPES: UserType[] = [UserType.CITIZEN, UserType.PRESS, UserType.NGO, UserType.RESEARCHER]
const REASON_SIDE = new Map<string, 'helpful' | 'not_helpful'>(CONTEXT_NOTE_RATING_REASONS.map((r) => [r.value, r.side]))
const DAY_MS = 86_400_000
const MAX_IDS_PER_QUERY = 50
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface TargetInfo {
  type: ContextNoteTargetType
  id: string
  /** Quem escreveu o conteúdo, quando se sabe (relato anônimo não grava o autor). */
  authorUserId: string | null
  /** Órgão dono do conteúdo (publicação feita como órgão) ou alvo dele (relato). */
  orgType: OrgType | null
  orgId: string | null
  anonymous: boolean
}

export interface RecalculateResult {
  evaluated: number
  changed: number
  shown: number
  notShown: number
}

@Injectable()
export class ContextNotesService {
  private readonly logger = new Logger(ContextNotesService.name)

  constructor(
    private readonly repo: ContextNotesRepository,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Chave de liberação ────────────────────────────────────────────────────────────
  /** Desligada por padrão: o recurso só vai a pessoas de verdade depois do jurídico (docs/dev/contexto-da-comunidade..., seção 10.6). */
  isEnabled(): boolean {
    return this.config.get<string>('CONTEXT_NOTES_ENABLED')?.trim().toLowerCase() === 'true'
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) throw new NotFoundException('Este recurso ainda não está disponível.')
  }

  // ── Alvos e conflitos ─────────────────────────────────────────────────────────────
  private async loadTarget(dto: ContextNoteTargetDto): Promise<TargetInfo> {
    if (dto.targetType === ContextNoteTargetType.POST) {
      const post = await this.repo.findPostTarget(dto.targetId)
      if (!post) throw new NotFoundException('Publicação não encontrada.')
      return {
        type: ContextNoteTargetType.POST,
        id: post.id,
        authorUserId: post.authorUserId,
        orgType: post.authorOrgType,
        orgId: post.authorOrgId,
        anonymous: false,
      }
    }
    const report = await this.repo.findReportTarget(dto.targetId)
    if (!report) throw new NotFoundException('Relato não encontrado.')
    const org = await this.recipientOrg(report.recipientType, report.recipientId)
    return {
      type: ContextNoteTargetType.REPORT,
      id: report.id,
      authorUserId: report.anonymous ? null : report.authorId,
      orgType: org?.orgType ?? null,
      orgId: org?.orgId ?? null,
      anonymous: report.anonymous,
    }
  }

  /** Órgão a quem o relato foi endereçado, no formato do vínculo de membro (filial vira a empresa dona). */
  private async recipientOrg(
    recipientType: RecipientType | null,
    recipientId: string | null,
  ): Promise<{ orgType: OrgType; orgId: string } | null> {
    if (!recipientType || !recipientId) return null
    if (recipientType === RecipientType.BRANCH) {
      const companyId = await this.repo.findBranchCompanyId(recipientId)
      return companyId ? { orgType: OrgType.COMPANY, orgId: companyId } : null
    }
    return { orgType: recipientType as OrgType, orgId: recipientId }
  }

  private toNoteTarget(info: { type: ContextNoteTargetType; id: string }): NoteTarget {
    return info.type === ContextNoteTargetType.POST ? { postId: info.id } : { reportId: info.id }
  }

  /** Quem escreveu o conteúdo, ou é do órgão dono ou alvo dele, não escreve nem avalia nota sobre ele. */
  private async isConflicted(userId: string, target: TargetInfo): Promise<boolean> {
    if (target.authorUserId && target.authorUserId === userId) return true
    if (target.orgType && target.orgId) return this.repo.isActiveOrgMember(userId, target.orgType, target.orgId)
    return false
  }

  // ── Elegibilidade ─────────────────────────────────────────────────────────────────
  /** Devolve o motivo (em português simples) de a pessoa não poder colaborar, ou `null` se pode. */
  private async ineligibleReason(userId: string): Promise<string | null> {
    const user = await this.repo.findUserForEligibility(userId)
    if (!user) return 'Conta não encontrada.'
    if (user.banned) return 'Sua conta está suspensa.'
    if (!user.emailVerified) return 'Confirme seu e-mail para colaborar.'
    if (!user.ageConfirmedAt) return 'Para colaborar, confirme que você tem 18 anos ou mais.'
    if (!CONTRIBUTOR_TYPES.includes(user.type)) {
      return 'Contas de órgãos, políticos, empresas e da equipe do Votz não escrevem nem avaliam notas.'
    }
    if (!accountOldEnough(user.createdAt)) return `Sua conta precisa ter pelo menos ${RULES.MIN_ACCOUNT_AGE_DAYS} dias para colaborar.`
    return null
  }

  private async requireActiveContributor(userId: string) {
    const reason = await this.ineligibleReason(userId)
    if (reason) throw new ForbiddenException(reason)
    const contributor = await this.repo.findContributor(userId)
    if (!contributor) throw new ForbiddenException('Entre como colaborador do Contexto da Comunidade para continuar.')
    if (contributor.suspendedAt) throw new ForbiddenException('Sua participação como colaborador está suspensa.')
    return contributor
  }

  async getContributorStatus(userId: string) {
    const enabled = this.isEnabled()
    const [reason, contributor] = await Promise.all([this.ineligibleReason(userId), this.repo.findContributor(userId)])
    const joined = contributor !== null
    const suspended = Boolean(contributor?.suspendedAt)
    const active = enabled && joined && !suspended && reason === null
    return {
      enabled,
      termsVersion: CONTEXT_CONTRIBUTOR_TERMS_VERSION,
      joined,
      suspended,
      blockedReason: reason,
      canRate: active,
      canWrite: active && contributor !== null && canWriteNotes(contributor),
      progress: {
        ratingsGiven: contributor?.ratingsGiven ?? 0,
        ratingsNeededToWrite: RULES.RATINGS_TO_WRITE,
      },
    }
  }

  async joinAsContributor(userId: string, dto: JoinContributorDto) {
    this.assertEnabled()
    if (dto.termsVersion !== CONTEXT_CONTRIBUTOR_TERMS_VERSION) {
      throw new BadRequestException('O termo mudou. Abra a tela de novo e leia a versão atual.')
    }
    const reason = await this.ineligibleReason(userId)
    if (reason) throw new ForbiddenException(reason)
    await this.repo.createContributor(userId, dto.termsVersion)
    return this.getContributorStatus(userId)
  }

  // ── Escrever ──────────────────────────────────────────────────────────────────────
  async createNote(userId: string, dto: CreateContextNoteDto): Promise<ContextNoteView> {
    this.assertEnabled()
    const contributor = await this.requireActiveContributor(userId)
    if (!canWriteNotes(contributor)) {
      throw new ForbiddenException(
        `Para escrever notas, avalie pelo menos ${RULES.RATINGS_TO_WRITE} notas de outras pessoas primeiro. Você avaliou ${contributor.ratingsGiven}.`,
      )
    }

    if (!kindAllowedFor(dto.targetType, dto.kind)) {
      throw new BadRequestException(
        dto.targetType === ContextNoteTargetType.REPORT
          ? 'Em relato só cabe prova adicional, novidade sobre o caso ou aviso de duplicado. Se você acha que o relato é falso, use "Denunciar".'
          : 'Esse tipo de nota não serve para publicação.',
      )
    }

    const target = await this.loadTarget(dto)
    if (await this.isConflicted(userId, target)) {
      throw new ForbiddenException('Você não pode escrever nota sobre um conteúdo seu ou do órgão a que ele se refere.')
    }

    const draft = checkDraft(DOMPurify.sanitize(dto.text, { ALLOWED_TAGS: [] }), dto.sources)
    if (!draft.ok || !draft.text || !draft.sources) throw new BadRequestException(draft.error)

    const noteTarget = this.toNoteTarget(target)
    if (await this.repo.findLiveNoteByAuthorAndTarget(userId, noteTarget)) {
      throw new ConflictException('Você já escreveu uma nota para este conteúdo.')
    }
    const today = await this.repo.countNotesByAuthorSince(userId, new Date(Date.now() - DAY_MS))
    if (today >= RULES.MAX_NOTES_PER_DAY) {
      throw new ForbiddenException(`Você chegou ao limite de ${RULES.MAX_NOTES_PER_DAY} notas por dia. Volte amanhã.`)
    }

    const note = await this.repo.createNote({
      target: noteTarget,
      authorId: userId,
      kind: dto.kind,
      text: draft.text,
      sources: draft.sources,
    })
    return { id: note.id, kind: note.kind, text: note.text, sources: note.sources, origin: 'HUMAN', shownAt: null } as ContextNoteView
  }

  // ── Avaliar ───────────────────────────────────────────────────────────────────────
  async rateNote(userId: string, noteId: string, dto: RateContextNoteDto) {
    this.assertEnabled()
    await this.requireActiveContributor(userId)

    const note = await this.repo.findNoteById(noteId)
    if (!note || note.status === ContextNoteStatus.REMOVED) throw new NotFoundException('Nota não encontrada.')
    if (note.authorId === userId) throw new ForbiddenException('Você não pode avaliar a sua própria nota.')

    const reportOrg = note.report ? await this.recipientOrg(note.report.recipientType, note.report.recipientId) : null
    const target: TargetInfo = note.post
      ? {
          type: ContextNoteTargetType.POST,
          id: note.postId as string,
          authorUserId: note.post.authorUserId,
          orgType: note.post.authorOrgType,
          orgId: note.post.authorOrgId,
          anonymous: false,
        }
      : {
          type: ContextNoteTargetType.REPORT,
          id: note.reportId as string,
          authorUserId: note.report?.authorId ?? null,
          orgType: reportOrg?.orgType ?? null,
          orgId: reportOrg?.orgId ?? null,
          anonymous: !note.report?.authorId,
        }
    if (await this.isConflicted(userId, target)) {
      throw new ForbiddenException('Você não pode avaliar nota sobre um conteúdo seu ou do órgão a que ele se refere.')
    }

    const reasons = [...new Set(dto.reasons ?? [])]
    if (reasons.length > RULES.MAX_RATING_REASONS) throw new BadRequestException('Escolha até 3 motivos.')
    const wanted = dto.value === ContextNoteRatingValue.NOT_HELPFUL ? 'not_helpful' : 'helpful'
    for (const reason of reasons) {
      if (REASON_SIDE.get(reason) !== wanted) throw new BadRequestException('Esse motivo não combina com a sua avaliação.')
    }

    const { created } = await this.repo.upsertRating(noteId, userId, dto.value, reasons)
    return { rated: true, changed: !created }
  }

  // ── Pedir contexto ────────────────────────────────────────────────────────────────
  async requestContext(user: { id: string; emailVerified: boolean }, dto: ContextNoteTargetDto) {
    this.assertEnabled()
    if (!user.emailVerified) throw new ForbiddenException('Confirme seu e-mail para pedir contexto.')
    const target = await this.loadTarget(dto)
    if (target.authorUserId === user.id) throw new ForbiddenException('Você não pode pedir contexto para o seu próprio conteúdo.')

    const today = await this.repo.countRequestsByUserSince(user.id, new Date(Date.now() - DAY_MS))
    if (today >= RULES.MAX_REQUESTS_PER_DAY) throw new ForbiddenException('Você chegou ao limite de pedidos de hoje.')
    try {
      await this.repo.createRequest(user.id, this.toNoteTarget(target))
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') throw new ConflictException('Você já pediu contexto aqui.')
      throw err
    }
    return { requested: true }
  }

  // ── Leitura ───────────────────────────────────────────────────────────────────────
  private parseIds(raw: string | undefined): string[] {
    if (!raw) return []
    return [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => UUID.test(s)))].slice(0, MAX_IDS_PER_QUERY)
  }

  /** Notas exibidas para uma lista de conteúdos (uma por conteúdo). Com o recurso desligado, não devolve nada. */
  async listShown(postIdsRaw?: string, reportIdsRaw?: string) {
    const empty = { enabled: this.isEnabled(), POST: {} as Record<string, ContextNoteView>, REPORT: {} as Record<string, ContextNoteView> }
    if (!empty.enabled) return empty
    const rows = await this.repo.findShown(this.parseIds(postIdsRaw), this.parseIds(reportIdsRaw))
    for (const row of rows) {
      const view: ContextNoteView = {
        id: row.id,
        kind: row.kind as ContextNoteView['kind'],
        text: row.text,
        sources: row.sources,
        origin: row.origin,
        shownAt: row.shownAt?.toISOString() ?? null,
      }
      const bucket = row.postId ? empty.POST : empty.REPORT
      const key = (row.postId ?? row.reportId) as string
      if (!bucket[key]) bucket[key] = view // as linhas já vêm da melhor para a pior
    }
    return empty
  }

  private previewOf(note: NoteWithPreview) {
    if (note.post) {
      return { type: ContextNoteTargetType.POST, id: note.post.id, title: 'Publicação no Feed', excerpt: note.post.content.slice(0, 200), link: `/publicacoes/${note.post.id}` }
    }
    return {
      type: ContextNoteTargetType.REPORT,
      id: note.report?.id as string,
      title: note.report?.title ?? 'Relato',
      excerpt: (note.report?.description ?? '').slice(0, 200),
      link: `/relatos/${note.report?.id}`,
    }
  }

  /** Fila de quem colabora: notas esperando a minha avaliação e conteúdos que receberam pedido de contexto. */
  async queue(userId: string) {
    this.assertEnabled()
    const contributor = await this.requireActiveContributor(userId)
    const candidates = await this.repo.findNotesToRate(userId, 40)
    const toRate: Array<{ note: { id: string; kind: string; text: string; sources: string[]; origin: string; createdAt: string }; target: ReturnType<ContextNotesService['previewOf']> }> = []
    for (const note of candidates) {
      if (toRate.length >= 20) break
      const target = await this.targetInfoForNote(note.postId, note.reportId)
      if (target && (await this.isConflicted(userId, target))) continue
      toRate.push({
        note: { id: note.id, kind: note.kind, text: note.text, sources: note.sources, origin: note.origin, createdAt: note.createdAt.toISOString() },
        target: this.previewOf(note),
      })
    }

    const canWrite = canWriteNotes(contributor)
    let requested: Array<{ count: number; target: { type: ContextNoteTargetType; id: string; title: string; excerpt: string; link: string } }> = []
    if (canWrite) {
      const found = await this.repo.findRequestedTargets(10)
      requested = [
        ...found.posts.filter((p) => p.post).map((p) => ({
          count: p.count,
          target: { type: ContextNoteTargetType.POST, id: p.post!.id, title: 'Publicação no Feed', excerpt: p.post!.content.slice(0, 200), link: `/publicacoes/${p.post!.id}` },
        })),
        ...found.reports.filter((r) => r.report).map((r) => ({
          count: r.count,
          target: { type: ContextNoteTargetType.REPORT, id: r.report!.id, title: r.report!.title, excerpt: r.report!.description.slice(0, 200), link: `/relatos/${r.report!.id}` },
        })),
      ].sort((a, b) => b.count - a.count)
    }
    return { canWrite, toRate, requested }
  }

  private async targetInfoForNote(postId: string | null, reportId: string | null): Promise<TargetInfo | null> {
    if (postId) return this.loadTarget({ targetType: ContextNoteTargetType.POST, targetId: postId }).catch(() => null)
    if (reportId) return this.loadTarget({ targetType: ContextNoteTargetType.REPORT, targetId: reportId }).catch(() => null)
    return null
  }

  // ── Job de hora em hora ───────────────────────────────────────────────────────────
  async recalculateAll(): Promise<RecalculateResult> {
    const result: RecalculateResult = { evaluated: 0, changed: 0, shown: 0, notShown: 0 }
    let cursor: string | null = null
    for (;;) {
      const batch = await this.repo.findNotesForEvaluation(cursor, 200)
      if (batch.length === 0) break
      cursor = batch[batch.length - 1].id
      const tallies = await this.repo.tallies(batch.map((n) => n.id))

      for (const note of batch) {
        result.evaluated += 1
        const tally = tallies.get(note.id) ?? emptyTally()
        const count = tallyCount(tally)
        const share = helpfulShare(tally)
        const next = evaluateNote({ status: note.status, ratingsCount: count, share, badStreak: note.badStreak })

        const unchanged =
          next.status === note.status && next.badStreak === note.badStreak && count === note.ratingsCount && share === note.helpfulShare
        if (unchanged) continue

        const firstResolution =
          note.status === ContextNoteStatus.NEEDS_RATINGS &&
          (next.status === ContextNoteStatus.SHOWN || next.status === ContextNoteStatus.NOT_SHOWN)
        let aligned: string[] = []
        let misaligned: string[] = []
        if (firstResolution) {
          const ratings = await this.repo.findRatingsOfNote(note.id)
          for (const r of ratings) (isAligned(r.value, next.status) ? aligned : misaligned).push(r.raterId)
        }

        await this.repo.applyEvaluation({
          noteId: note.id,
          from: note.status,
          to: next.status,
          ratingsCount: count,
          share,
          badStreak: next.badStreak,
          firstResolution,
          alignedRaterIds: aligned,
          misalignedRaterIds: misaligned,
        })
        if (next.status !== note.status) {
          result.changed += 1
          if (next.status === ContextNoteStatus.SHOWN) result.shown += 1
          if (next.status === ContextNoteStatus.NOT_SHOWN) result.notShown += 1
        }

        if (next.status === ContextNoteStatus.SHOWN && !note.shownAt) {
          await this.notifyTargetAuthor(note).catch((err) => this.logger.error(`Aviso da nota ${note.id} falhou`, err))
        }
      }
      if (batch.length < 200) break
    }
    return result
  }

  /** Avisa o autor do conteúdo que uma nota passou a aparecer nele. Relato anônimo não tem a quem avisar. */
  private async notifyTargetAuthor(note: {
    id: string
    postId: string | null
    reportId: string | null
    post: { authorUserId: string } | null
    report: { authorId: string | null; anonymous: boolean } | null
  }) {
    const userId = note.post ? note.post.authorUserId : note.report && !note.report.anonymous ? note.report.authorId : null
    if (!userId) return
    await this.notifications.notify({
      userId,
      type: NotificationType.CONTEXT_NOTE_SHOWN,
      reportId: note.reportId,
      metadata: {
        noteId: note.id,
        targetType: note.postId ? ContextNoteTargetType.POST : ContextNoteTargetType.REPORT,
        targetId: note.postId ?? note.reportId,
      },
    })
  }

  // ── Moderação ─────────────────────────────────────────────────────────────────────
  /** Tira a nota do ar com motivo, registra em `moderation_actions` e avisa quem escreveu. */
  async removeByModeration(noteId: string, actorId: string, reason: string) {
    const clean = DOMPurify.sanitize(reason, { ALLOWED_TAGS: [] }).trim()
    if (clean.length < 10) throw new BadRequestException('Explique o motivo em pelo menos 10 caracteres.')
    const removed = await this.repo.removeNote(noteId, actorId, clean)
    if (!removed) throw new NotFoundException('Nota não encontrada ou já removida.')
    if (removed.authorId) {
      const contact = await this.repo.findUserContact(removed.authorId)
      await deliverModerationNotice(this.mail, this.prisma, this.logger, {
        actionId: removed.actionId,
        email: contact?.email,
        name: contact?.name,
        kind: 'NOTE_REMOVED',
        reason: clean,
      })
    }
    return { removed: true }
  }

  async grantWrite(userId: string) {
    const contributor = await this.repo.findContributor(userId)
    if (!contributor) throw new NotFoundException('Esta pessoa ainda não entrou como colaboradora.')
    await this.repo.grantWrite(userId)
    return { granted: true }
  }

  async setSuspended(userId: string, suspended: boolean) {
    const contributor = await this.repo.findContributor(userId)
    if (!contributor) throw new NotFoundException('Esta pessoa ainda não entrou como colaboradora.')
    await this.repo.setSuspended(userId, suspended)
    return { suspended }
  }

  async adminList(status: ContextNoteStatus | undefined, page = 1, limit = 20) {
    const { rows, total } = await this.repo.listForAdmin({ status, page, limit })
    return {
      data: rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        text: n.text,
        sources: n.sources,
        origin: n.origin,
        status: n.status,
        ratingsCount: n.ratingsCount,
        helpfulShare: n.helpfulShare,
        shownAt: n.shownAt,
        createdAt: n.createdAt,
        author: n.author,
        target: this.previewOf(n),
      })),
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    }
  }
}
