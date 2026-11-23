import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, PressContactDeclineReason, PressContactStatus, type NotificationType } from '@prisma/client'
import {
  PRESS_CONTACT_LIMITS as L,
  type PressContactReceived,
  type PressContactReportStatus,
  type PressContactSent,
} from '@votz/shared-types'
import { MailService } from '../mail/mail.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CreatePressContactDto, RespondPressContactDto } from './dto/press-contact.dto'
import { PressAccessService } from './press-access.service'
import { PressContactRepository } from './press-contact.repository'
import { contactStatusView, declineBlocks, declineCooldownStart, expiresAtFrom } from './press-contact.rules'
import { plainText } from './press-credentials.service'

/** Mensagem única para "não dá": não revela se a pessoa bloqueou, recusou ou desligou o aceite. */
const NOT_AVAILABLE = 'Esta pessoa não está recebendo pedidos de contato agora.'

@Injectable()
export class PressContactService {
  private readonly logger = new Logger(PressContactService.name)

  constructor(
    private readonly repo: PressContactRepository,
    private readonly access: PressAccessService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Jornalista ──────────────────────────────────────────────────────────────

  async request(journalistId: string, dto: CreatePressContactDto): Promise<PressContactSent> {
    const now = new Date()
    const access = await this.access.require(journalistId)
    if (!access.limits.canRequestContact) {
      throw new ForbiddenException('O pedido de contato a cidadãos é do plano Imprensa Pro.')
    }
    if (!access.credentialId) {
      throw new ForbiddenException('Peça a credencial de imprensa para poder enviar pedidos de contato.')
    }

    const report = await this.repo.findReport(dto.reportId)
    if (!report) throw new NotFoundException('Relato não encontrado.')
    const author = report.author
    if (report.anonymous || !report.authorId || !author || !report.pressContactOk || author.banned || !author.emailVerified) {
      throw new ForbiddenException('O autor deste relato não aceitou contato da imprensa.')
    }
    if (author.id === journalistId) throw new BadRequestException('Você não pode pedir contato a si mesmo.')
    if (await this.repo.isBlocked(author.id, journalistId)) throw new ForbiddenException(NOT_AVAILABLE)

    if ((await this.repo.countAbusive(journalistId)) >= L.ABUSE_SUSPEND_AT) {
      throw new ForbiddenException('Seus pedidos de contato estão suspensos até a moderação revisar as denúncias.')
    }
    if (await this.repo.findForReport(journalistId, report.id)) {
      throw new ConflictException('Você já fez um pedido de contato para este relato.')
    }
    // Sem teto por dia e sem limite de pedidos pendentes para a mesma pessoa (decisão do dono, 23/11/2026).
    // O que protege o cidadão é: um pedido por relato, esta espera depois de uma recusa, o bloqueio e a suspensão por abuso.
    if (await this.repo.findRecentDecline(journalistId, author.id, declineCooldownStart(now))) {
      throw new ForbiddenException(NOT_AVAILABLE)
    }

    const message = plainText(dto.message, L.MESSAGE_MAX)
    if (message.length < L.MESSAGE_MIN) {
      throw new BadRequestException(`Explique o pedido em pelo menos ${L.MESSAGE_MIN} caracteres.`)
    }
    const credential = await this.repo.findCredential(access.credentialId)
    if (!credential || credential.status !== 'APPROVED') {
      throw new ForbiddenException('Sua credencial de imprensa não está aprovada.')
    }

    let created
    try {
      created = await this.repo.create({
        journalistId,
        recipientId: author.id,
        reportId: report.id,
        outletName: credential.outletName,
        outletType: credential.outletType,
        outletWebsite: credential.website,
        message,
        expiresAt: expiresAtFrom(now),
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Você já fez um pedido de contato para este relato.')
      }
      throw err
    }

    this.notify(author.id, 'PRESS_CONTACT_REQUEST', { requestId: created.id, outletName: credential.outletName, reportTitle: report.title })
    this.mail
      .sendPressContactRequest(author.email, author.name, { outletName: credential.outletName, reportTitle: report.title, message })
      .catch((err) => this.logger.error(`Falha ao enviar o e-mail do pedido ${created.id}`, err))

    return {
      id: created.id,
      status: 'PENDING',
      createdAt: created.createdAt.toISOString(),
      expiresAt: created.expiresAt.toISOString(),
      message,
      recipient: { name: author.name },
      report: { id: report.id, title: report.title },
      reply: null,
      viaVotzChat: false,
      respondedAt: null,
    }
  }

  async listSent(journalistId: string): Promise<PressContactSent[]> {
    await this.access.require(journalistId)
    const now = new Date()
    return (await this.repo.listSent(journalistId)).map((r) => ({
      id: r.id,
      status: contactStatusView(r, now),
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      message: r.message,
      recipient: { name: r.recipient.name },
      report: r.report,
      // A resposta só chega ao jornalista se a pessoa aceitou. Recusa não mostra motivo.
      reply: r.status === PressContactStatus.ACCEPTED ? r.reply : null,
      viaVotzChat: r.status === PressContactStatus.ACCEPTED ? r.viaVotzChat : false,
      respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    }))
  }

  async cancel(journalistId: string, id: string): Promise<{ id: string; status: 'CANCELLED' }> {
    const row = await this.repo.findForJournalist(id, journalistId)
    if (!row) throw new NotFoundException('Pedido não encontrado.')
    if (!(await this.repo.cancel(id, new Date()))) throw new ConflictException('Este pedido não está mais aguardando resposta.')
    return { id, status: 'CANCELLED' }
  }

  // ── Cidadão ─────────────────────────────────────────────────────────────────

  async listReceived(userId: string): Promise<PressContactReceived[]> {
    const now = new Date()
    return (await this.repo.listReceived(userId))
      // Pedido pendente de quem perdeu a credencial some: não há mais a quem responder.
      .filter((r) => r.status !== PressContactStatus.PENDING || (r.journalist.type === 'PRESS' && r.journalist.verified))
      .map((r) => ({
        id: r.id,
        status: contactStatusView(r, now),
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        message: r.message,
        outlet: { name: r.outletName, type: r.outletType, website: r.outletWebsite },
        journalist: { id: r.journalist.id, name: r.journalist.name },
        report: r.report,
        reply: r.reply,
        viaVotzChat: r.viaVotzChat,
        respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
      }))
  }

  async respond(userId: string, id: string, dto: RespondPressContactDto): Promise<{ id: string; status: 'ACCEPTED' | 'DECLINED' }> {
    const now = new Date()
    const row = await this.repo.findForRecipient(id, userId)
    if (!row) throw new NotFoundException('Pedido não encontrado.')
    if (contactStatusView(row, now) !== 'PENDING') {
      throw new ConflictException('Este pedido não está mais aguardando resposta.')
    }
    const j = row.journalist
    if (j.type !== 'PRESS' || !j.verified || j.banned) {
      throw new ConflictException('Este pedido não vale mais: a credencial de imprensa não está ativa.')
    }

    if (dto.action === 'accept') {
      const reply = dto.reply ? plainText(dto.reply, L.REPLY_MAX) || null : null
      const ok = await this.repo.respond(id, { status: PressContactStatus.ACCEPTED, reply, viaVotzChat: dto.viaVotzChat === true }, now)
      if (!ok) throw new ConflictException('Este pedido não está mais aguardando resposta.')
      this.notify(j.id, 'PRESS_CONTACT_ACCEPTED', { requestId: id, reportTitle: row.report.title })
      return { id, status: 'ACCEPTED' }
    }

    const reason = (dto.reason ?? 'NOT_NOW') as PressContactDeclineReason
    const ok = await this.repo.respond(id, { status: PressContactStatus.DECLINED, declineReason: reason }, now)
    if (!ok) throw new ConflictException('Este pedido não está mais aguardando resposta.')
    if (declineBlocks(reason, dto.block)) await this.repo.blockJournalist(userId, j.id)
    // O jornalista sabe só que não deu; o motivo (e a denúncia) não aparecem para ele.
    this.notify(j.id, 'PRESS_CONTACT_DECLINED', { requestId: id, reportTitle: row.report.title })
    return { id, status: 'DECLINED' }
  }

  // ── Relato: aceite do autor e estado do botão ───────────────────────────────

  async setOptIn(userId: string, reportId: string, pressContactOk: boolean): Promise<{ id: string; pressContactOk: boolean }> {
    const report = await this.repo.findReport(reportId)
    if (!report) throw new NotFoundException('Relato não encontrado.')
    if (report.anonymous || report.authorId !== userId) {
      throw new ForbiddenException('Só o autor de um relato público pode mudar isso.')
    }
    return this.repo.setReportOptIn(reportId, pressContactOk)
  }

  async reportStatus(userId: string, reportId: string): Promise<PressContactReportStatus> {
    const report = await this.repo.findReport(reportId)
    if (!report) throw new NotFoundException('Relato não encontrado.')
    const isAuthor = !report.anonymous && report.authorId === userId
    const optIn = !report.anonymous && report.pressContactOk
    // Só o autor e o jornalista credenciado sabem do aceite; para os demais a resposta é sempre "não" (nada vaza).
    const status: PressContactReportStatus = { optIn: isAuthor ? optIn : false, isAuthor, canRequest: false, reason: null, alreadyRequested: false }
    if (isAuthor) return status

    let limits
    try {
      limits = (await this.access.require(userId)).limits
    } catch {
      return status
    }
    status.optIn = optIn
    status.alreadyRequested = !!(await this.repo.findForReport(userId, reportId))
    if (!optIn) status.reason = 'O autor deste relato não aceitou contato da imprensa.'
    else if (!limits.canRequestContact) status.reason = 'O pedido de contato é do plano Imprensa Pro.'
    else if (status.alreadyRequested) status.reason = 'Você já fez um pedido de contato para este relato.'
    else status.canRequest = true
    return status
  }

  private notify(userId: string, type: string, metadata: Record<string, unknown>) {
    this.notifications
      .notify({ userId, type: type as NotificationType, metadata })
      .catch((err) => this.logger.error(`Falha ao notificar (${type})`, err))
  }
}
