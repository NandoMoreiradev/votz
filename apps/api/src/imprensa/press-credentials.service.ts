import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
} from '@nestjs/common'
import { createHash, randomBytes } from 'crypto'
import * as DOMPurify from 'isomorphic-dompurify'
import { PressCredentialStatus, UserType, type NotificationType, type PressCredential } from '@prisma/client'
import { PRESS_CREDENTIAL_LIMITS as L, type MyPressCredential } from '@votz/shared-types'
import { MailService } from '../mail/mail.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CreatePressCredentialDto } from './dto/press-credential.dto'
import { pressSignals } from './press-signals'
import {
  CONVERTIBLE_TO_PRESS, PressCredentialsRepository, type TransitionResult,
} from './press-credentials.repository'

export const TOKEN_TTL_MS = 48 * 3_600_000
export const RESEND_MIN_MS = 2 * 60_000
export const REJECTION_COOLDOWN_DAYS = 7

/** Texto livre sem HTML. O DOMPurify devolve `&amp;` etc., que voltam a caractere comum (o React já escapa na tela). */
export function plainText(raw: string, max: number): string {
  const clean = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  return clean
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function newToken(): { token: string; hash: string; expires: Date } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token), expires: new Date(Date.now() + TOKEN_TTL_MS) }
}

@Injectable()
export class PressCredentialsService {
  private readonly logger = new Logger(PressCredentialsService.name)

  constructor(
    private readonly repo: PressCredentialsRepository,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Jornalista ──────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreatePressCredentialDto): Promise<MyPressCredential> {
    const user = await this.repo.findUser(userId)
    if (!user) throw new NotFoundException('Usuário não encontrado.')
    if (user.banned) throw new ForbiddenException('Esta conta não pode pedir credencial.')
    if (!user.emailVerified) {
      throw new BadRequestException('Confirme o e-mail da sua conta antes de pedir a credencial de imprensa.')
    }
    if (user.type === UserType.PRESS && user.verified) {
      throw new ConflictException('Você já tem credencial de imprensa.')
    }
    if (!CONVERTIBLE_TO_PRESS.includes(user.type)) {
      throw new BadRequestException('Este tipo de conta não usa credencial de imprensa.')
    }
    if (await this.repo.findPending(userId)) {
      throw new ConflictException('Você já tem um pedido em análise. Aguarde a resposta da nossa equipe.')
    }
    const lastRejection = await this.repo.findLastRejection(userId)
    if (lastRejection?.reviewedAt) {
      const retryAt = lastRejection.reviewedAt.getTime() + REJECTION_COOLDOWN_DAYS * 86_400_000
      if (retryAt > Date.now()) {
        throw new HttpException(
          `O último pedido foi recusado há pouco tempo. Corrija os dados e tente de novo a partir de ${new Date(retryAt).toLocaleDateString('pt-BR')}.`,
          HttpStatus.TOO_MANY_REQUESTS,
        )
      }
    }

    const outletName = plainText(dto.outletName, L.OUTLET_NAME_MAX)
    if (outletName.length < 2) throw new BadRequestException('Informe o nome do veículo.')
    const portfolioUrls = [...new Set(dto.portfolioUrls.map((u) => u.trim()))].slice(0, L.PORTFOLIO_MAX)
    const { token, hash, expires } = newToken()

    const created = await this.repo.create({
      userId,
      outletName,
      outletType: dto.outletType,
      jobTitle: dto.jobTitle ? plainText(dto.jobTitle, L.JOB_TITLE_MAX) || null : null,
      website: dto.website.trim(),
      newsroomEmail: dto.newsroomEmail,
      coverageArea: dto.coverageArea ? plainText(dto.coverageArea, L.COVERAGE_MAX) || null : null,
      portfolioUrls,
      note: dto.note ? plainText(dto.note, L.NOTE_MAX) || null : null,
      emailTokenHash: hash,
      emailTokenExpires: expires,
    })

    // Falha no envio não derruba o pedido: a pessoa pode pedir o reenvio.
    this.mail.sendPressEmailConfirmation(created.newsroomEmail, user.name, { outletName, token }).catch((err) =>
      this.logger.error(`Falha ao enviar confirmação de e-mail da credencial ${created.id}`, err),
    )
    return this.toMine(created)
  }

  async findMine(userId: string): Promise<MyPressCredential | null> {
    const latest = await this.repo.findLatestByUser(userId)
    return latest ? this.toMine(latest) : null
  }

  async confirmEmail(userId: string, token: string): Promise<{ confirmed: true }> {
    const credential = await this.repo.findByTokenHash(hashToken(token))
    const invalid = new BadRequestException('Link inválido ou vencido. Peça um novo e-mail de confirmação na página de imprensa.')
    if (!credential || credential.userId !== userId || credential.status !== PressCredentialStatus.PENDING) throw invalid
    if (!credential.emailTokenExpires || credential.emailTokenExpires.getTime() < Date.now()) throw invalid
    await this.repo.confirmEmail(credential.id)
    return { confirmed: true }
  }

  async resendEmail(userId: string): Promise<{ sent: boolean; alreadyConfirmed?: boolean }> {
    const pending = await this.repo.findPending(userId)
    if (!pending) throw new NotFoundException('Você não tem pedido em análise.')
    if (pending.emailConfirmedAt) return { sent: false, alreadyConfirmed: true }

    const lastSentAt = pending.emailTokenExpires ? pending.emailTokenExpires.getTime() - TOKEN_TTL_MS : 0
    if (Date.now() - lastSentAt < RESEND_MIN_MS) {
      throw new HttpException('Espere 2 minutos antes de pedir outro e-mail.', HttpStatus.TOO_MANY_REQUESTS)
    }
    const user = await this.repo.findUser(userId)
    const { token, hash, expires } = newToken()
    await this.repo.setEmailToken(pending.id, hash, expires)
    this.mail.sendPressEmailConfirmation(pending.newsroomEmail, user?.name ?? '', { outletName: pending.outletName, token }).catch((err) =>
      this.logger.error(`Falha ao reenviar confirmação de e-mail da credencial ${pending.id}`, err),
    )
    return { sent: true }
  }

  // ── Moderação ───────────────────────────────────────────────────────────────

  async list(status: string | undefined, page = 1, limit = 20) {
    if (status && !(status in PressCredentialStatus)) throw new BadRequestException('Situação inválida.')
    const safeLimit = Math.min(Math.max(limit, 1), 50)
    const safePage = Math.max(page, 1)
    const { data, total } = await this.repo.list({
      status: status as PressCredentialStatus | undefined,
      page: safePage,
      limit: safeLimit,
    })
    const abuse = await this.repo.contactAbuseCounts([...new Set(data.map((c) => c.userId))])
    return {
      data: data.map((c) => ({
        contactAbuseCount: abuse.get(c.userId) ?? 0,
        id: c.id,
        status: c.status,
        plan: c.plan,
        outletName: c.outletName,
        outletType: c.outletType,
        jobTitle: c.jobTitle,
        website: c.website,
        newsroomEmail: c.newsroomEmail,
        coverageArea: c.coverageArea,
        portfolioUrls: c.portfolioUrls,
        note: c.note,
        reviewNote: c.reviewNote,
        reviewedAt: c.reviewedAt,
        reviewer: c.reviewer,
        createdAt: c.createdAt,
        user: { id: c.user.id, name: c.user.name, email: c.user.email, type: c.user.type, createdAt: c.user.createdAt },
        signals: pressSignals({
          newsroomEmail: c.newsroomEmail,
          website: c.website,
          emailConfirmedAt: c.emailConfirmedAt,
          userCreatedAt: c.user.createdAt,
        }),
      })),
      total,
      page: safePage,
      limit: safeLimit,
    }
  }

  async approve(id: string, reviewerId: string, reviewNote?: string) {
    const note = reviewNote ? plainText(reviewNote, L.REVIEW_NOTE_MAX) || null : null
    const result = await this.repo.approve(id, reviewerId, note)
    const done = this.unwrap(result)
    this.afterDecision('APPROVED', done, note)
    return { id, status: PressCredentialStatus.APPROVED }
  }

  async reject(id: string, reviewerId: string, reviewNote?: string) {
    const note = this.requireNote(reviewNote)
    const done = this.unwrap(await this.repo.reject(id, reviewerId, note))
    this.afterDecision('REJECTED', done, note)
    return { id, status: PressCredentialStatus.REJECTED }
  }

  async revoke(id: string, reviewerId: string, reviewNote?: string) {
    const note = this.requireNote(reviewNote)
    const done = this.unwrap(await this.repo.revoke(id, reviewerId, note))
    this.afterDecision('REVOKED', done, note)
    return { id, status: PressCredentialStatus.REVOKED }
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  private requireNote(raw?: string): string {
    const note = raw ? plainText(raw, L.REVIEW_NOTE_MAX) : ''
    if (note.length < 10) throw new BadRequestException('Escreva o motivo (pelo menos 10 caracteres). A pessoa vai ler.')
    return note
  }

  private unwrap(result: TransitionResult) {
    if (result.ok) return result
    if (result.reason === 'EMAIL_NOT_CONFIRMED') {
      throw new BadRequestException('O e-mail da redação ainda não foi confirmado. Aguarde a pessoa confirmar ou peça o reenvio.')
    }
    if (result.reason === 'USER_TYPE') {
      throw new BadRequestException('Esta conta mudou de tipo e não pode virar imprensa. Recuse o pedido.')
    }
    throw new ConflictException('Este pedido não está mais nessa situação (outra pessoa pode ter decidido antes).')
  }

  private afterDecision(
    decision: 'APPROVED' | 'REJECTED' | 'REVOKED',
    who: { userId: string; email: string; name: string; outletName: string },
    reviewNote: string | null,
  ) {
    const type: NotificationType = `PRESS_CREDENTIAL_${decision}` as NotificationType
    this.notifications
      .notify({ userId: who.userId, type, metadata: { outletName: who.outletName, reviewNote } })
      .catch((err) => this.logger.error('Falha ao notificar decisão de credencial de imprensa', err))
    this.mail
      .sendPressCredentialDecision(who.email, who.name, { decision, outletName: who.outletName, reviewNote })
      .catch((err) => this.logger.error('Falha ao enviar e-mail da decisão de credencial de imprensa', err))
  }

  private toMine(c: PressCredential): MyPressCredential {
    return {
      id: c.id,
      status: c.status,
      outletName: c.outletName,
      outletType: c.outletType,
      jobTitle: c.jobTitle,
      website: c.website,
      newsroomEmail: c.newsroomEmail,
      coverageArea: c.coverageArea,
      portfolioUrls: c.portfolioUrls,
      note: c.note,
      emailConfirmed: c.emailConfirmedAt !== null,
      reviewNote: c.reviewNote,
      reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }
  }
}
