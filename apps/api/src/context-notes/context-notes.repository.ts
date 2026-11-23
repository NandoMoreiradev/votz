import { Injectable } from '@nestjs/common'
import {
  ContextNoteKind,
  ContextNoteOrigin,
  ContextNoteRatingValue,
  ContextNoteStatus,
  MembershipStatus,
  ModerationActionType,
  OrgType,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface NoteTarget {
  postId?: string
  reportId?: string
}

const NOTE_PREVIEW_SELECT = {
  id: true,
  kind: true,
  text: true,
  sources: true,
  origin: true,
  status: true,
  ratingsCount: true,
  helpfulShare: true,
  shownAt: true,
  createdAt: true,
  postId: true,
  reportId: true,
  post: { select: { id: true, content: true } },
  report: { select: { id: true, title: true, description: true } },
} satisfies Prisma.ContextNoteSelect

export type NoteWithPreview = Prisma.ContextNoteGetPayload<{ select: typeof NOTE_PREVIEW_SELECT }>

@Injectable()
export class ContextNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Alvos ────────────────────────────────────────────────────────────────────────
  findPostTarget(id: string) {
    return this.prisma.post.findUnique({
      where: { id },
      select: { id: true, authorUserId: true, authorOrgType: true, authorOrgId: true },
    })
  }

  findReportTarget(id: string) {
    return this.prisma.report.findUnique({
      where: { id },
      select: { id: true, authorId: true, anonymous: true, recipientType: true, recipientId: true },
    })
  }

  /** Relato endereçado a uma filial conta como endereçado à empresa dona dela. */
  async findBranchCompanyId(branchId: string): Promise<string | null> {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { companyId: true } })
    return branch?.companyId ?? null
  }

  async isActiveOrgMember(userId: string, orgType: OrgType, orgId: string): Promise<boolean> {
    const found = await this.prisma.orgMembership.findFirst({
      where: { userId, orgType, orgId, status: MembershipStatus.ACTIVE },
      select: { id: true },
    })
    return found !== null
  }

  findUserForEligibility(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, type: true, banned: true, emailVerified: true, ageConfirmedAt: true, createdAt: true },
    })
  }

  // ── Colaboradores ─────────────────────────────────────────────────────────────────
  findContributor(userId: string) {
    return this.prisma.contextContributor.findUnique({ where: { userId } })
  }

  createContributor(userId: string, termsVersion: string) {
    return this.prisma.contextContributor.upsert({
      where: { userId },
      create: { userId, termsVersion, termsAcceptedAt: new Date() },
      update: { termsVersion, termsAcceptedAt: new Date() },
    })
  }

  grantWrite(userId: string) {
    return this.prisma.contextContributor.update({ where: { userId }, data: { writeGrantedAt: new Date() } })
  }

  setSuspended(userId: string, suspended: boolean) {
    return this.prisma.contextContributor.update({
      where: { userId },
      data: { suspendedAt: suspended ? new Date() : null },
    })
  }

  // ── Notas ─────────────────────────────────────────────────────────────────────────
  async createNote(data: {
    target: NoteTarget
    authorId: string
    kind: ContextNoteKind
    text: string
    sources: string[]
    origin?: ContextNoteOrigin
  }) {
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.contextNote.create({
        data: {
          postId: data.target.postId ?? null,
          reportId: data.target.reportId ?? null,
          authorId: data.authorId,
          kind: data.kind,
          text: data.text,
          sources: data.sources,
          origin: data.origin ?? ContextNoteOrigin.HUMAN,
        },
        select: { id: true, kind: true, text: true, sources: true, status: true, createdAt: true },
      })
      await tx.contextNoteStatusLog.create({
        data: { noteId: note.id, fromStatus: null, toStatus: ContextNoteStatus.NEEDS_RATINGS, cause: 'CREATED', actorId: data.authorId },
      })
      return note
    })
  }

  findNoteById(id: string) {
    return this.prisma.contextNote.findUnique({
      where: { id },
      select: {
        id: true,
        postId: true,
        reportId: true,
        authorId: true,
        status: true,
        text: true,
        post: { select: { authorUserId: true, authorOrgType: true, authorOrgId: true } },
        report: { select: { authorId: true, recipientType: true, recipientId: true } },
        author: { select: { id: true, email: true, name: true } },
      },
    })
  }

  findLiveNoteByAuthorAndTarget(authorId: string, target: NoteTarget) {
    return this.prisma.contextNote.findFirst({
      where: {
        authorId,
        ...(target.postId ? { postId: target.postId } : { reportId: target.reportId }),
        status: { not: ContextNoteStatus.REMOVED },
      },
      select: { id: true },
    })
  }

  countNotesByAuthorSince(authorId: string, since: Date) {
    return this.prisma.contextNote.count({ where: { authorId, createdAt: { gte: since } } })
  }

  // ── Avaliações ────────────────────────────────────────────────────────────────────
  findRating(noteId: string, raterId: string) {
    return this.prisma.contextNoteRating.findUnique({
      where: { noteId_raterId: { noteId, raterId } },
      select: { id: true, value: true },
    })
  }

  /** Grava ou troca a avaliação. Só a primeira avaliação de uma nota conta para `ratingsGiven`. */
  async upsertRating(noteId: string, raterId: string, value: ContextNoteRatingValue, reasons: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.contextNoteRating.findUnique({
        where: { noteId_raterId: { noteId, raterId } },
        select: { id: true },
      })
      if (existing) {
        await tx.contextNoteRating.update({ where: { id: existing.id }, data: { value, reasons } })
        return { created: false }
      }
      await tx.contextNoteRating.create({ data: { noteId, raterId, value, reasons } })
      await tx.contextContributor.update({ where: { userId: raterId }, data: { ratingsGiven: { increment: 1 } } })
      return { created: true }
    })
  }

  // ── Pedidos de contexto ───────────────────────────────────────────────────────────
  createRequest(requesterId: string, target: NoteTarget) {
    return this.prisma.contextNoteRequest.create({
      data: { requesterId, postId: target.postId ?? null, reportId: target.reportId ?? null },
      select: { id: true },
    })
  }

  countRequestsByUserSince(requesterId: string, since: Date) {
    return this.prisma.contextNoteRequest.count({ where: { requesterId, createdAt: { gte: since } } })
  }

  // ── Leitura pública ───────────────────────────────────────────────────────────────
  /** Uma nota exibida por conteúdo (a de maior parcela "útil"). */
  findShown(postIds: string[], reportIds: string[]) {
    const or: Prisma.ContextNoteWhereInput[] = []
    if (postIds.length) or.push({ postId: { in: postIds } })
    if (reportIds.length) or.push({ reportId: { in: reportIds } })
    if (or.length === 0) return Promise.resolve([])
    return this.prisma.contextNote.findMany({
      where: { status: ContextNoteStatus.SHOWN, OR: or },
      select: { id: true, postId: true, reportId: true, kind: true, text: true, sources: true, origin: true, shownAt: true },
      orderBy: [{ helpfulShare: 'desc' }, { shownAt: 'asc' }],
    })
  }

  // ── Fila de quem colabora ─────────────────────────────────────────────────────────
  findNotesToRate(raterId: string, take: number) {
    return this.prisma.contextNote.findMany({
      where: {
        status: ContextNoteStatus.NEEDS_RATINGS,
        OR: [{ authorId: null }, { authorId: { not: raterId } }],
        ratings: { none: { raterId } },
      },
      select: NOTE_PREVIEW_SELECT,
      orderBy: { createdAt: 'asc' },
      take,
    })
  }

  /** Conteúdos que receberam pedido de contexto e ainda não têm nota viva, os mais pedidos primeiro. */
  async findRequestedTargets(take: number) {
    const [posts, reports] = await Promise.all([
      this.prisma.contextNoteRequest.groupBy({
        by: ['postId'],
        where: { postId: { not: null }, post: { contextNotes: { none: { status: { in: [ContextNoteStatus.NEEDS_RATINGS, ContextNoteStatus.SHOWN] } } } } },
        _count: { _all: true },
        orderBy: { _count: { postId: 'desc' } },
        take,
      }),
      this.prisma.contextNoteRequest.groupBy({
        by: ['reportId'],
        where: { reportId: { not: null }, report: { contextNotes: { none: { status: { in: [ContextNoteStatus.NEEDS_RATINGS, ContextNoteStatus.SHOWN] } } } } },
        _count: { _all: true },
        orderBy: { _count: { reportId: 'desc' } },
        take,
      }),
    ])
    const postIds = posts.map((p) => p.postId as string)
    const reportIds = reports.map((r) => r.reportId as string)
    const [postRows, reportRows] = await Promise.all([
      postIds.length
        ? this.prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, content: true } })
        : Promise.resolve([]),
      reportIds.length
        ? this.prisma.report.findMany({ where: { id: { in: reportIds } }, select: { id: true, title: true, description: true, anonymous: true } })
        : Promise.resolve([]),
    ])
    return {
      posts: posts.map((p) => ({ count: p._count._all, post: postRows.find((r) => r.id === p.postId) })),
      reports: reports.map((r) => ({ count: r._count._all, report: reportRows.find((x) => x.id === r.reportId) })),
    }
  }

  // ── Job de hora em hora ───────────────────────────────────────────────────────────
  findNotesForEvaluation(afterId: string | null, take: number) {
    return this.prisma.contextNote.findMany({
      where: { status: { not: ContextNoteStatus.REMOVED } },
      select: {
        id: true,
        status: true,
        ratingsCount: true,
        helpfulShare: true,
        badStreak: true,
        shownAt: true,
        postId: true,
        reportId: true,
        post: { select: { authorUserId: true } },
        report: { select: { authorId: true, anonymous: true } },
      },
      orderBy: { id: 'asc' },
      take,
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
    })
  }

  async tallies(noteIds: string[]): Promise<Map<string, Record<ContextNoteRatingValue, number>>> {
    const rows = await this.prisma.contextNoteRating.groupBy({
      by: ['noteId', 'value'],
      where: { noteId: { in: noteIds } },
      _count: { _all: true },
    })
    const map = new Map<string, Record<ContextNoteRatingValue, number>>()
    for (const row of rows) {
      const entry = map.get(row.noteId) ?? { HELPFUL: 0, SOMEWHAT: 0, NOT_HELPFUL: 0 }
      entry[row.value] = row._count._all
      map.set(row.noteId, entry)
    }
    return map
  }

  /**
   * Grava o novo estado da nota e o histórico. Na primeira vez que a nota sai de "esperando" para um resultado final,
   * conta quem acertou e quem errou (cada nota conta uma vez só para a régua de escrever).
   */
  async applyEvaluation(params: {
    noteId: string
    from: ContextNoteStatus
    to: ContextNoteStatus
    ratingsCount: number
    share: number | null
    badStreak: number
    firstResolution: boolean
    alignedRaterIds: string[]
    misalignedRaterIds: string[]
  }) {
    const { noteId, from, to } = params
    await this.prisma.$transaction(async (tx) => {
      await tx.contextNote.update({
        where: { id: noteId },
        data: {
          status: to,
          ratingsCount: params.ratingsCount,
          helpfulShare: params.share,
          badStreak: params.badStreak,
          ...(to === ContextNoteStatus.SHOWN && from !== ContextNoteStatus.SHOWN ? { shownAt: new Date() } : {}),
        },
      })
      if (from !== to) {
        await tx.contextNoteStatusLog.create({
          data: { noteId, fromStatus: from, toStatus: to, cause: 'RULE', ratingsCount: params.ratingsCount, helpfulShare: params.share },
        })
      }
      if (params.firstResolution) {
        if (params.alignedRaterIds.length) {
          await tx.contextContributor.updateMany({
            where: { userId: { in: params.alignedRaterIds } },
            data: { ratingsResolved: { increment: 1 }, ratingsAligned: { increment: 1 } },
          })
        }
        if (params.misalignedRaterIds.length) {
          await tx.contextContributor.updateMany({
            where: { userId: { in: params.misalignedRaterIds } },
            data: { ratingsResolved: { increment: 1 } },
          })
        }
      }
    })
  }

  findRatingsOfNote(noteId: string) {
    return this.prisma.contextNoteRating.findMany({ where: { noteId }, select: { raterId: true, value: true } })
  }

  /** Só atualiza os números (sem mudar de estado), para a nota mostrar a contagem certa. */
  updateCounters(noteId: string, ratingsCount: number, share: number | null, badStreak: number) {
    return this.prisma.contextNote.update({ where: { id: noteId }, data: { ratingsCount, helpfulShare: share, badStreak } })
  }

  // ── Moderação ─────────────────────────────────────────────────────────────────────
  async removeNote(noteId: string, actorId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.contextNote.findUnique({ where: { id: noteId }, select: { id: true, status: true, authorId: true } })
      if (!note || note.status === ContextNoteStatus.REMOVED) return null
      await tx.contextNote.update({
        where: { id: noteId },
        data: { status: ContextNoteStatus.REMOVED, removedAt: new Date(), removedReason: reason, removedById: actorId },
      })
      await tx.contextNoteStatusLog.create({
        data: { noteId, fromStatus: note.status, toStatus: ContextNoteStatus.REMOVED, cause: 'MODERATION', actorId },
      })
      const action = await tx.moderationAction.create({
        data: { action: ModerationActionType.CONTEXT_NOTE_REMOVED, targetType: 'CONTEXT_NOTE', targetId: noteId, reason, actorId },
        select: { id: true },
      })
      return { actionId: action.id, authorId: note.authorId }
    })
  }

  findUserContact(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  }

  async listForAdmin(params: { status?: ContextNoteStatus; page: number; limit: number }) {
    const where: Prisma.ContextNoteWhereInput = params.status ? { status: params.status } : {}
    const [rows, total] = await Promise.all([
      this.prisma.contextNote.findMany({
        where,
        select: { ...NOTE_PREVIEW_SELECT, author: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.contextNote.count({ where }),
    ])
    return { rows, total }
  }
}
