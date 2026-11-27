import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import DOMPurify from 'isomorphic-dompurify'
import {
  AdvocacyCloseReason,
  ArchiveReason as PrismaArchiveReason,
  FollowerActorType,
  OrgPermission,
  PoliticianStatus,
  Prisma,
  VoteType,
} from '@prisma/client'
import {
  ACTIVE_REPORT_STATUSES,
  EventType,
  REPORT_LIFECYCLE_LIMITS as L,
  RecipientType,
  ReportStatus,
  TIMELINE_ACTIONS,
  UserType,
  canRecipientChangeStatus,
  checkDisputeWindow,
  getReportStatusLabel,
  normalizeLocationKey,
} from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { ReportMediaService } from '../storage/report-media.service'
import { ContentSafetyService } from '../content-safety/content-safety.service'
import { PostsService } from '../posts/posts.service'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { resolvePoliticianTerritory } from '../analytics/analytics.scope'
import { UpdatableStatus, UpdateStatusDto } from '../reports/dto/update-status.dto'
import { DisputeDto } from '../reports/dto/dispute.dto'
import { DisputeResolution, ResolveDisputeDto } from '../reports/dto/resolve-dispute.dto'
import { AdvocateReportDto } from '../posts/dto/advocate-report.dto'
import { ReportLifecycleEffects } from './report-lifecycle.effects'
import { LifecycleActor, LifecycleReport } from './report-lifecycle.types'

const STALE_MESSAGE = 'O relato mudou enquanto você respondia. Atualize a página e tente de novo.'
const MODERATION_ROLES: string[] = [UserType.MODERATOR, UserType.ADMIN]

type Tx = Prisma.TransactionClient

/**
 * Porta única para mudar um relato: avocar, desistir, publicar atualização, mudar status, contestar,
 * decidir contestação e confirmar resolução. Toda rota (página do relato, Portal do Mandato, app) passa
 * por aqui, então a regra é uma só. Cada ação grava o relato e o evento da Memória na mesma transação,
 * com o status atual como condição: o segundo clique, ou quem agiu sobre uma tela velha, recebe 409.
 */
@Injectable()
export class ReportLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effects: ReportLifecycleEffects,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly reportMedia?: ReportMediaService,
    @Optional() private readonly contentSafety?: ContentSafetyService,
    @Optional() private readonly posts?: PostsService,
  ) {}

  // ── Leitura e identificação ────────────────────────────────────────────────

  async loadReport(reportId: string, db: PrismaService | Tx = this.prisma): Promise<LifecycleReport> {
    const r = await db.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        title: true,
        status: true,
        category: true,
        anonymous: true,
        authorId: true,
        recipientType: true,
        recipientId: true,
        moderationStatus: true,
        firstResponseAt: true,
        resolvedAt: true,
        archivedAt: true,
        resolutionConfirmedAt: true,
        state: true,
        city: true,
        cityKey: true,
        timeline: { where: { type: EventType.DISPUTED }, select: { createdAt: true } },
      },
    })
    // Relato oculto pela moderação não recebe ações (e não aparece para o público).
    if (!r || r.moderationStatus === 'HIDDEN') throw new NotFoundException('Relato não encontrado.')
    const { timeline, ...rest } = r
    return { ...rest, disputeDates: timeline.map((t) => t.createdAt) }
  }

  isModeration(user: { type: string }): boolean {
    return MODERATION_ROLES.includes(user.type)
  }

  /** Organização (político ou entidade) em nome de quem a pessoa age, com as checagens de 2FA e permissão. */
  async resolveOrgActor(
    user: ActingUser,
    report: LifecycleReport,
    expected?: { orgType: 'POLITICIAN' | 'ENTITY'; orgId: string },
  ): Promise<Extract<LifecycleActor, { kind: 'ORG' }>> {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      expected ? expected.orgType : ['ENTITY', 'POLITICIAN'],
      OrgPermission.RESPOND_REPORTS,
      expected ? { expectedOrgId: expected.orgId } : undefined,
    )
    const orgType = acting.orgType as FollowerActorType
    let orgName: string
    if (orgType === FollowerActorType.POLITICIAN) {
      const politician = await this.prisma.politician.findUnique({
        where: { id: acting.orgId },
        select: { name: true, status: true },
      })
      if (!politician) throw new ForbiddenException('Perfil de político não encontrado.')
      if (politician.status !== PoliticianStatus.ATIVO) {
        throw new ForbiddenException('Este político não tem mandato ativo e não pode agir em relatos.')
      }
      orgName = politician.name
    } else {
      const entity = await this.prisma.entity.findUnique({
        where: { id: acting.orgId },
        select: { legalName: true },
      })
      if (!entity) throw new ForbiddenException('Entidade não encontrada.')
      orgName = entity.legalName
    }
    const advocacy = await this.prisma.reportAdvocacy.findUnique({
      where: { reportId_orgType_orgId: { reportId: report.id, orgType, orgId: acting.orgId } },
      select: { closedAt: true },
    })
    return {
      kind: 'ORG',
      userId: user.id,
      orgType,
      orgId: acting.orgId,
      orgName,
      isRecipient: report.recipientType === orgType && report.recipientId === acting.orgId,
      hasActiveAdvocacy: !!advocacy && advocacy.closedAt === null,
    }
  }

  private orgMeta(actor: LifecycleActor): Record<string, unknown> {
    if (actor.kind === 'MODERATION') return { actorRole: 'MODERATION' }
    return {
      orgType: actor.orgType,
      orgId: actor.orgId,
      orgName: actor.orgName,
      ...(actor.orgType === FollowerActorType.POLITICIAN ? { politicianId: actor.orgId } : { entityId: actor.orgId }),
      ...(actor.isRecipient ? { asRecipient: true } : {}),
    }
  }

  private async prepareMedia(urls: string[] | undefined, userId: string) {
    this.storage?.assertOwnStorageUrls(urls, 'reports')
    await this.reportMedia?.attach(urls, userId)
  }

  private cleanText(raw: string, label: string): string {
    const clean = DOMPurify.sanitize(raw ?? '').trim()
    if (clean.length > 0) this.contentSafety?.assertCleanOrThrow([clean], label)
    return clean
  }

  private async markFirstResponse(tx: Tx, reportId: string, now: Date): Promise<boolean> {
    const res = await tx.report.updateMany({
      where: { id: reportId, firstResponseAt: null },
      data: { firstResponseAt: now },
    })
    return res.count > 0
  }

  private closingFields(to: string, now: Date, archiveReason?: string, withoutEvidence?: boolean) {
    if (to === ReportStatus.RESOLVED) {
      return {
        resolvedAt: now,
        resolvedWithoutEvidence: !!withoutEvidence,
        resolutionConfirmedAt: null,
        archivedAt: null,
        archiveReason: null,
      }
    }
    if (to === ReportStatus.ARCHIVED) {
      return {
        archivedAt: now,
        archiveReason: (archiveReason ?? null) as PrismaArchiveReason | null,
        resolvedAt: null,
        resolvedWithoutEvidence: false,
        resolutionConfirmedAt: null,
      }
    }
    // Voltou a andar: datas de encerramento antigas não valem mais (SLA e "resolvidos no mês").
    return {
      resolvedAt: null,
      resolvedWithoutEvidence: false,
      resolutionConfirmedAt: null,
      archivedAt: null,
      archiveReason: null,
    }
  }

  // ── Mudar status ───────────────────────────────────────────────────────────

  /** `PATCH /reports/:id/status`: com status muda o status; sem status publica atualização. */
  async updateFromReportPage(reportId: string, dto: UpdateStatusDto, user: ActingUser) {
    if (dto.status === undefined) return this.postUpdate(reportId, user, { content: dto.content, media: dto.media })
    return this.changeStatus(reportId, user, dto)
  }

  async changeStatus(reportId: string, user: ActingUser, dto: UpdateStatusDto) {
    if (!dto.status) throw new BadRequestException('Escolha o novo status.')
    const report = await this.loadReport(reportId)
    const from = report.status
    const to = dto.status as string

    let actor: LifecycleActor
    if (this.isModeration(user)) {
      actor = { kind: 'MODERATION', userId: user.id, userType: user.type as 'MODERATOR' | 'ADMIN' }
      if (from === ReportStatus.DISPUTED) {
        throw new BadRequestException('Relato contestado se resolve pela decisão da contestação.')
      }
      if (from === to) throw new BadRequestException('O relato já está com esse status.')
    } else {
      actor = await this.resolveOrgActor(user, report)
      if (!actor.isRecipient) {
        throw new ForbiddenException(
          'Só quem recebeu o relato pode mudar o status. Quem avocou pode publicar atualizações.',
        )
      }
      if (!canRecipientChangeStatus(from, to)) {
        if (from === ReportStatus.DISPUTED) {
          throw new BadRequestException(
            'O relato está contestado. Publique sua resposta com provas; quem decide é a moderação do Votz.',
          )
        }
        if (from === ReportStatus.RESOLVED || from === ReportStatus.ARCHIVED) {
          throw new BadRequestException('O relato já foi encerrado. Ele só volta a andar se for contestado.')
        }
        throw new BadRequestException(
          `Não é possível passar de "${getReportStatusLabel(from)}" para "${getReportStatusLabel(to)}".`,
        )
      }
    }

    const media = dto.media ?? []
    const content = this.cleanText(dto.content, 'atualização')
    if (content.length < L.UPDATE_MIN) throw new BadRequestException(`Escreva pelo menos ${L.UPDATE_MIN} caracteres.`)
    if (to === ReportStatus.RESOLVED) {
      if (content.length < L.RESOLVE_MIN) {
        throw new BadRequestException(
          `Para marcar como resolvido, explique o que foi feito em pelo menos ${L.RESOLVE_MIN} caracteres.`,
        )
      }
      if (media.length === 0 && !dto.noEvidence) {
        throw new BadRequestException(
          'Para marcar como resolvido, anexe uma foto ou documento, ou marque "sem foto ou documento" e explique no texto.',
        )
      }
    }
    if (to === ReportStatus.ARCHIVED && !dto.archiveReason) {
      throw new BadRequestException('Para arquivar, escolha o motivo.')
    }
    await this.prepareMedia(media, user.id)

    const now = new Date()
    const eventType =
      to === ReportStatus.RESOLVED ? EventType.RESOLVED : to === ReportStatus.ARCHIVED ? EventType.ARCHIVED : EventType.STATUS_CHANGED

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.report.updateMany({
        where: { id: reportId, status: from as ReportStatus },
        data: {
          status: to as ReportStatus,
          ...this.closingFields(to, now, dto.archiveReason, to === ReportStatus.RESOLVED && media.length === 0),
        },
      })
      if (res.count === 0) throw new ConflictException(STALE_MESSAGE)
      if (actor.kind === 'ORG' && actor.isRecipient) await this.markFirstResponse(tx, reportId, now)
      await tx.timelineEvent.create({
        data: {
          reportId,
          type: eventType,
          content,
          authorId: user.id,
          metadata: {
            action: TIMELINE_ACTIONS.STATUS_CHANGED,
            previousStatus: from,
            newStatus: to,
            media,
            ...(to === ReportStatus.ARCHIVED ? { archiveReason: dto.archiveReason } : {}),
            ...(to === ReportStatus.RESOLVED && media.length === 0 ? { withoutEvidence: true } : {}),
            ...(actor.kind === 'MODERATION' ? { administrative: true } : {}),
            ...this.orgMeta(actor),
          },
        },
      })
    })

    this.effects.afterStatusChange(report, from, to, user.id, actor.kind === 'ORG' ? actor.orgName : undefined)
    return { id: reportId, status: to }
  }

  // ── Atualização sem trocar status ──────────────────────────────────────────

  async postUpdate(reportId: string, user: ActingUser, input: { content: string; media?: string[] }) {
    const report = await this.loadReport(reportId)
    let actor: LifecycleActor
    if (this.isModeration(user)) {
      actor = { kind: 'MODERATION', userId: user.id, userType: user.type as 'MODERATOR' | 'ADMIN' }
    } else {
      actor = await this.resolveOrgActor(user, report)
      if (!actor.isRecipient && !actor.hasActiveAdvocacy) {
        throw new ForbiddenException(
          'Para publicar no relato, você precisa ser quem recebeu o relato ou ter avocado. Avoque o relato antes.',
        )
      }
    }
    const content = this.cleanText(input.content, 'atualização')
    if (content.length < L.UPDATE_MIN) throw new BadRequestException(`Escreva pelo menos ${L.UPDATE_MIN} caracteres.`)
    const media = input.media ?? []
    await this.prepareMedia(media, user.id)

    const isRecipient = actor.kind === 'ORG' && actor.isRecipient
    const now = new Date()
    let firstResponse = false
    await this.prisma.$transaction(async (tx) => {
      if (isRecipient) firstResponse = await this.markFirstResponse(tx, reportId, now)
      await tx.timelineEvent.create({
        data: {
          reportId,
          // Texto de quem recebeu é resposta oficial; de quem avocou (ou da moderação) é atualização.
          type: isRecipient ? EventType.RESPONDED : EventType.UPDATE,
          content,
          authorId: user.id,
          metadata: {
            action: isRecipient ? TIMELINE_ACTIONS.RESPONDED : TIMELINE_ACTIONS.UPDATE,
            media,
            ...(report.status === ReportStatus.DISPUTED ? { duringDispute: true } : {}),
            ...this.orgMeta(actor),
          },
        },
      })
    })

    this.effects.afterUpdate(report, user.id, firstResponse, actor.kind === 'ORG' ? actor.orgName : undefined)
    return { id: reportId, status: report.status }
  }

  // ── Avocar e desistir ──────────────────────────────────────────────────────

  private async assertTerritory(actor: Extract<LifecycleActor, { kind: 'ORG' }>, report: LifecycleReport) {
    if (!report.state) return
    if (actor.orgType === FollowerActorType.POLITICIAN) {
      const p = await this.prisma.politician.findUnique({
        where: { id: actor.orgId },
        select: { office: true, state: true, city: true },
      })
      if (!p?.state) return // cadastro sem UF: não dá para delimitar; não bloqueia
      let territory: ReturnType<typeof resolvePoliticianTerritory>
      try {
        territory = resolvePoliticianTerritory({ office: p.office, state: p.state, city: p.city })
      } catch {
        return
      }
      const reportCityKey = report.cityKey ?? (report.city ? normalizeLocationKey(report.city) : null)
      if (territory.state !== report.state.toUpperCase() || (territory.cityKey && reportCityKey && territory.cityKey !== reportCityKey)) {
        throw new ForbiddenException(
          territory.cityKey
            ? 'Só dá para avocar relatos da cidade do seu mandato.'
            : 'Só dá para avocar relatos do estado do seu mandato.',
        )
      }
      return
    }
    const e = await this.prisma.entity.findUnique({ where: { id: actor.orgId }, select: { state: true } })
    if (e?.state && e.state.toUpperCase() !== report.state.toUpperCase()) {
      throw new ForbiddenException('Só dá para avocar relatos do estado da sua entidade.')
    }
  }

  async advocate(
    reportId: string,
    user: ActingUser,
    expected: { orgType: 'POLITICIAN' | 'ENTITY'; orgId: string },
    dto: AdvocateReportDto = {},
  ) {
    const report = await this.loadReport(reportId)
    const actor = await this.resolveOrgActor(user, report, expected)
    const canAdvocate = [...ACTIVE_REPORT_STATUSES, ReportStatus.DISPUTED].includes(report.status as ReportStatus)
    if (!canAdvocate) throw new BadRequestException('Só dá para avocar relato que ainda não foi encerrado.')
    if (actor.hasActiveAdvocacy) throw new ConflictException('Você já avocou este relato.')
    if (!actor.isRecipient) await this.assertTerritory(actor, report)

    const message = dto.postContent ? this.cleanText(dto.postContent, 'mensagem') : ''
    const now = new Date()
    const promisedFor = dto.promisedInDays ? new Date(now.getTime() + dto.promisedInDays * 86_400_000) : null
    const where = { reportId_orgType_orgId: { reportId, orgType: actor.orgType, orgId: actor.orgId } }

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.reportAdvocacy.findUnique({ where, select: { closedAt: true } })
        if (existing && existing.closedAt === null) throw new ConflictException('Você já avocou este relato.')
        const data = {
          userId: user.id,
          message: message || null,
          promisedFor,
          deadlineNotifiedAt: null,
          closedAt: null,
          closedReason: null,
          closedNote: null,
        }
        if (existing) await tx.reportAdvocacy.update({ where, data })
        else await tx.reportAdvocacy.create({ data: { reportId, orgType: actor.orgType, orgId: actor.orgId, ...data } })

        // Quem avoca passa a acompanhar: recebe todos os avisos de andamento.
        await tx.reportFollower.upsert({
          where: { reportId_actorType_actorId: { reportId, actorType: actor.orgType, actorId: actor.orgId } },
          create: { reportId, actorType: actor.orgType, actorId: actor.orgId },
          update: {},
        })

        const promise = promisedFor
          ? ` Prazo prometido: ${promisedFor.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
          : ''
        await tx.timelineEvent.create({
          data: {
            reportId,
            type: EventType.RESPONDED,
            content: `${actor.orgName} avocou este relato e assumiu o compromisso público de acompanhá-lo até a solução.${promise}`,
            authorId: user.id,
            metadata: {
              action: TIMELINE_ACTIONS.ADVOCATED,
              ...(promisedFor ? { promisedFor: promisedFor.toISOString() } : {}),
              ...(message ? { message } : {}),
              ...this.orgMeta(actor),
            },
          },
        })

        // Só quem recebeu o relato mexe no status e no prazo de resposta. Avocação de terceiro dá
        // visibilidade, mas não alivia a pressão sobre quem deve resolver.
        if (actor.isRecipient) {
          await this.markFirstResponse(tx, reportId, now)
          if (report.status === ReportStatus.OPEN) {
            const moved = await tx.report.updateMany({
              where: { id: reportId, status: ReportStatus.OPEN },
              data: { status: ReportStatus.IN_PROGRESS },
            })
            if (moved.count > 0) {
              await tx.timelineEvent.create({
                data: {
                  reportId,
                  type: EventType.STATUS_CHANGED,
                  content: `${actor.orgName} assumiu o relato e começou a cuidar dele.`,
                  authorId: user.id,
                  metadata: {
                    action: TIMELINE_ACTIONS.STATUS_CHANGED,
                    previousStatus: ReportStatus.OPEN,
                    newStatus: ReportStatus.IN_PROGRESS,
                    ...this.orgMeta(actor),
                  },
                },
              })
            }
          }
        }
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Você já avocou este relato.')
      }
      throw err
    }

    let postId: string | undefined
    if (dto.publishToFeed && this.posts) {
      const created = await this.posts.createAdvocacyPost({
        reportId,
        userId: user.id,
        orgType: actor.orgType,
        orgId: actor.orgId,
        content: message || undefined,
        media: dto.media,
      })
      postId = created.id
    }

    this.effects.afterAdvocacy(report, user.id, actor.orgName, false)
    if (actor.isRecipient && report.status === ReportStatus.OPEN) {
      this.effects.afterStatusChange(report, ReportStatus.OPEN, ReportStatus.IN_PROGRESS, user.id, actor.orgName)
    }
    return postId ? { advocated: true, postId } : { advocated: true }
  }

  async withdrawAdvocacy(reportId: string, user: ActingUser, reason: string) {
    const report = await this.loadReport(reportId)
    const actor = await this.resolveOrgActor(user, report)
    if (!actor.hasActiveAdvocacy) throw new NotFoundException('Você não tem avocação ativa neste relato.')
    const note = this.cleanText(reason, 'motivo')
    if (note.length < L.WITHDRAW_MIN) throw new BadRequestException(`Explique o motivo em pelo menos ${L.WITHDRAW_MIN} caracteres.`)
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.reportAdvocacy.updateMany({
        where: { reportId, orgType: actor.orgType, orgId: actor.orgId, closedAt: null },
        data: { closedAt: now, closedReason: AdvocacyCloseReason.WITHDRAWN, closedNote: note },
      })
      if (res.count === 0) throw new ConflictException(STALE_MESSAGE)
      await tx.timelineEvent.create({
        data: {
          reportId,
          type: EventType.UPDATE,
          content: `${actor.orgName} desistiu da avocação. Motivo: ${note}`,
          authorId: user.id,
          metadata: { action: TIMELINE_ACTIONS.ADVOCACY_WITHDRAWN, reason: note, ...this.orgMeta(actor) },
        },
      })
    })
    this.effects.afterAdvocacy(report, user.id, actor.orgName, true)
    return { advocated: false }
  }

  // ── Contestação ────────────────────────────────────────────────────────────

  async dispute(reportId: string, dto: DisputeDto, userId: string) {
    const report = await this.loadReport(reportId)
    const isAuthor = !!report.authorId && report.authorId === userId
    if (!isAuthor) {
      const meToo = await this.prisma.vote.findFirst({
        where: { reportId, userId, type: VoteType.ME_TOO },
        select: { id: true },
      })
      if (!meToo) {
        throw new ForbiddenException('Só quem fez o relato ou marcou "Eu também" pode contestar.')
      }
    }
    const check = checkDisputeWindow({
      status: report.status,
      resolvedAt: report.resolvedAt,
      archivedAt: report.archivedAt,
      disputeDates: report.disputeDates,
    })
    if (!check.ok) {
      const messages = {
        NOT_CLOSED: 'Só dá para contestar um relato marcado como resolvido ou arquivado.',
        WINDOW_EXPIRED: 'O prazo de 30 dias para contestar esta resolução já terminou.',
        ALREADY_DISPUTED: 'Esta resolução já foi contestada.',
      } as const
      throw new BadRequestException(messages[check.reason])
    }
    const reason = this.cleanText(dto.reason, 'contestação')
    if (reason.length < L.DISPUTE_MIN) throw new BadRequestException(`Explique em pelo menos ${L.DISPUTE_MIN} caracteres.`)
    await this.prepareMedia(dto.evidence, userId)

    const from = report.status
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.report.updateMany({
        where: { id: reportId, status: from as ReportStatus },
        data: { status: ReportStatus.DISPUTED },
      })
      if (res.count === 0) throw new ConflictException(STALE_MESSAGE)
      await tx.timelineEvent.create({
        data: {
          reportId,
          type: EventType.DISPUTED,
          content: reason,
          // Em relato anônimo a contestação não leva nome (não expõe ninguém ligado ao relato).
          authorId: report.anonymous ? null : userId,
          metadata: {
            evidence: dto.evidence ?? [],
            previousStatus: from,
            disputedBy: isAuthor ? 'AUTHOR' : 'ME_TOO',
            // Uso interno (avisar da decisão); nunca exposto em rota pública.
            disputerUserId: userId,
          },
        },
      })
    })
    this.effects.afterDispute(report, from, userId)
    return { id: reportId, status: ReportStatus.DISPUTED }
  }

  async resolveDispute(reportId: string, dto: ResolveDisputeDto, user: { id: string; type: string }) {
    if (!this.isModeration(user)) throw new ForbiddenException('Só a moderação do Votz decide contestações.')
    const report = await this.loadReport(reportId)
    if (report.status !== ReportStatus.DISPUTED) throw new BadRequestException('Este relato não está contestado.')

    const lastDispute = await this.prisma.timelineEvent.findFirst({
      where: { reportId, type: EventType.DISPUTED },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    })
    const disputeMeta = (lastDispute?.metadata ?? {}) as Record<string, unknown>
    const previousClosed = disputeMeta.previousStatus === ReportStatus.ARCHIVED ? ReportStatus.ARCHIVED : ReportStatus.RESOLVED
    const newStatus = dto.decision === DisputeResolution.REOPEN ? ReportStatus.OPEN : previousClosed
    const justification = this.cleanText(dto.justification, 'decisão')
    if (justification.length < L.DECISION_MIN) {
      throw new BadRequestException(`Explique a decisão em pelo menos ${L.DECISION_MIN} caracteres.`)
    }

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.report.updateMany({
        where: { id: reportId, status: ReportStatus.DISPUTED },
        // Reabrir apaga as datas de encerramento; manter a resolução preserva as datas originais.
        data: newStatus === ReportStatus.OPEN
          ? { status: newStatus, ...this.closingFields(ReportStatus.OPEN, new Date()) }
          : { status: newStatus },
      })
      if (res.count === 0) throw new ConflictException(STALE_MESSAGE)
      await tx.timelineEvent.create({
        data: {
          reportId,
          type: EventType.STATUS_CHANGED,
          content: justification,
          authorId: user.id,
          metadata: {
            action: TIMELINE_ACTIONS.DISPUTE_DECIDED,
            decision: dto.decision,
            previousStatus: ReportStatus.DISPUTED,
            newStatus,
            actorRole: 'MODERATION',
          },
        },
      })
    })

    const disputerUserId = typeof disputeMeta.disputerUserId === 'string' ? disputeMeta.disputerUserId : null
    this.effects.afterDisputeDecision(report, dto.decision, newStatus, user.id, disputerUserId)
    return { id: reportId, status: newStatus }
  }

  // ── Confirmação do cidadão ─────────────────────────────────────────────────

  async confirmResolution(reportId: string, userId: string) {
    const report = await this.loadReport(reportId)
    if (!report.authorId || report.authorId !== userId) {
      throw new ForbiddenException('Só quem fez o relato pode confirmar a resolução.')
    }
    if (report.status !== ReportStatus.RESOLVED) throw new BadRequestException('O relato não está marcado como resolvido.')
    if (report.resolutionConfirmedAt) throw new ConflictException('Você já confirmou esta resolução.')
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.report.updateMany({
        where: { id: reportId, status: ReportStatus.RESOLVED, resolutionConfirmedAt: null },
        data: { resolutionConfirmedAt: now },
      })
      if (res.count === 0) throw new ConflictException(STALE_MESSAGE)
      await tx.timelineEvent.create({
        data: {
          reportId,
          type: EventType.UPDATE,
          content: 'Quem fez o relato confirmou que o problema foi resolvido.',
          authorId: userId,
          metadata: { action: TIMELINE_ACTIONS.RESOLUTION_CONFIRMED },
        },
      })
    })
    this.effects.afterConfirmation(report, userId)
    return { id: reportId, status: ReportStatus.RESOLVED, resolutionConfirmedAt: now }
  }

  // ── Fila de contestações da moderação ──────────────────────────────────────

  async disputeQueue(user: { type: string }, page = 1, limit = 20) {
    if (!this.isModeration(user)) throw new ForbiddenException('Só a moderação do Votz vê as contestações.')
    const where: Prisma.ReportWhereInput = { status: ReportStatus.DISPUTED, moderationStatus: { not: 'HIDDEN' } }
    const [total, reports] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: { updatedAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          category: true,
          city: true,
          state: true,
          recipientType: true,
          recipientId: true,
          resolvedWithoutEvidence: true,
          archiveReason: true,
          timeline: {
            where: {
              type: { in: [EventType.DISPUTED, EventType.RESOLVED, EventType.ARCHIVED, EventType.RESPONDED, EventType.UPDATE] },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { id: true, type: true, content: true, metadata: true, createdAt: true },
          },
        },
      }),
    ])

    const recipientName = async (type: string | null, id: string | null) => {
      if (!id) return null
      if (type === RecipientType.POLITICIAN) {
        return (await this.prisma.politician.findUnique({ where: { id }, select: { name: true } }))?.name ?? null
      }
      if (type === RecipientType.ENTITY) {
        return (await this.prisma.entity.findUnique({ where: { id }, select: { legalName: true } }))?.legalName ?? null
      }
      return null
    }

    const now = Date.now()
    const items = await Promise.all(
      reports.map(async (r) => {
        const dispute = r.timeline.find((e) => e.type === EventType.DISPUTED)
        const disputeAt = dispute?.createdAt ?? new Date()
        const closing = r.timeline.find(
          (e) => (e.type === EventType.RESOLVED || e.type === EventType.ARCHIVED) && e.createdAt <= disputeAt,
        )
        const replies = r.timeline
          .filter((e) => (e.type === EventType.RESPONDED || e.type === EventType.UPDATE) && e.createdAt > disputeAt)
          .reverse()
        const strip = (m: unknown) => {
          const { disputerUserId: _ignored, ...rest } = (m ?? {}) as Record<string, unknown>
          return rest
        }
        return {
          id: r.id,
          title: r.title,
          category: r.category,
          city: r.city,
          state: r.state,
          recipientType: r.recipientType,
          recipientName: await recipientName(r.recipientType, r.recipientId),
          resolvedWithoutEvidence: r.resolvedWithoutEvidence,
          archiveReason: r.archiveReason,
          waitingDays: Math.floor((now - disputeAt.getTime()) / 86_400_000),
          dispute: dispute
            ? { content: dispute.content, createdAt: dispute.createdAt, metadata: strip(dispute.metadata) }
            : null,
          closing: closing ? { type: closing.type, content: closing.content, createdAt: closing.createdAt, metadata: closing.metadata } : null,
          repliesAfterDispute: replies.map((e) => ({ id: e.id, content: e.content, createdAt: e.createdAt, metadata: e.metadata })),
        }
      }),
    )
    items.sort((a, b) => b.waitingDays - a.waitingDays)
    return { data: items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } }
  }

  /** Para o status vindo do Portal do Mandato (valores aceitos são os mesmos da página do relato). */
  static isUpdatableStatus(status: string): status is UpdatableStatus {
    return (Object.values(UpdatableStatus) as string[]).includes(status)
  }
}
