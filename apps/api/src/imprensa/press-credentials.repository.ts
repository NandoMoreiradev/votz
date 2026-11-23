import { Injectable } from '@nestjs/common'
import { ModerationActionType, Prisma, PressCredentialStatus, PressOutletType, PressPlan, UserType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** Tipos de conta que podem virar imprensa. Equipe do Votz e contas de organização ficam de fora. */
export const CONVERTIBLE_TO_PRESS: UserType[] = [UserType.CITIZEN, UserType.NGO, UserType.RESEARCHER, UserType.PRESS]

export interface NewPressCredential {
  userId: string
  outletName: string
  outletType: PressOutletType
  jobTitle: string | null
  website: string
  newsroomEmail: string
  coverageArea: string | null
  portfolioUrls: string[]
  note: string | null
  emailTokenHash: string
  emailTokenExpires: Date
}

const USER_FOR_REVIEW = {
  id: true, name: true, email: true, type: true, verified: true, emailVerified: true, createdAt: true,
} as const

export type TransitionResult =
  | { ok: true; userId: string; outletName: string; email: string; name: string }
  | { ok: false; reason: 'NOT_FOUND_OR_STATE' | 'EMAIL_NOT_CONFIRMED' | 'USER_TYPE' }

@Injectable()
export class PressCredentialsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, type: true, verified: true, emailVerified: true, banned: true },
    })
  }

  findPending(userId: string) {
    return this.prisma.pressCredential.findFirst({ where: { userId, status: PressCredentialStatus.PENDING } })
  }

  findLastRejection(userId: string) {
    return this.prisma.pressCredential.findFirst({
      where: { userId, status: PressCredentialStatus.REJECTED },
      orderBy: { reviewedAt: 'desc' },
      select: { reviewedAt: true },
    })
  }

  /** Conta e credencial aprovada (a que vale) de quem está pedindo acesso às ferramentas de imprensa. */
  async findAccess(userId: string) {
    const [user, credential] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { type: true, verified: true, banned: true } }),
      this.prisma.pressCredential.findFirst({
        where: { userId, status: PressCredentialStatus.APPROVED },
        orderBy: { reviewedAt: 'desc' },
        select: { id: true, plan: true, stripeCustomerId: true, stripeSubscriptionId: true },
      }),
    ])
    return { user, credential }
  }

  /** Quantas denúncias de abuso (pedido de contato recusado como abusivo) cada jornalista tem, para o moderador ver na fila. */
  async contactAbuseCounts(journalistIds: string[]): Promise<Map<string, number>> {
    if (journalistIds.length === 0) return new Map()
    const rows = await this.prisma.pressContactRequest.groupBy({
      by: ['journalistId'],
      where: { journalistId: { in: journalistIds }, declineReason: 'ABUSIVE' },
      _count: { _all: true },
    })
    return new Map(rows.map((r) => [r.journalistId, r._count._all]))
  }

  findForPlan(id: string) {
    return this.prisma.pressCredential.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, plan: true, outletName: true },
    })
  }

  /** Troca o plano de uma credencial aprovada e grava a auditoria na mesma transação. */
  setPlan(id: string, userId: string, plan: PressPlan, actorId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.pressCredential.updateMany({
        where: { id, status: PressCredentialStatus.APPROVED },
        data: { plan },
      })
      if (moved.count === 0) return false
      await tx.moderationAction.create({
        data: { action: ModerationActionType.PRESS_PLAN_CHANGED, targetType: 'USER', targetId: userId, reason, actorId },
      })
      return true
    })
  }

  findLatestByUser(userId: string) {
    return this.prisma.pressCredential.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
  }

  create(data: NewPressCredential) {
    return this.prisma.pressCredential.create({ data })
  }

  setEmailToken(id: string, emailTokenHash: string, emailTokenExpires: Date) {
    return this.prisma.pressCredential.update({ where: { id }, data: { emailTokenHash, emailTokenExpires } })
  }

  findByTokenHash(emailTokenHash: string) {
    return this.prisma.pressCredential.findUnique({ where: { emailTokenHash } })
  }

  confirmEmail(id: string) {
    return this.prisma.pressCredential.update({
      where: { id },
      data: { emailConfirmedAt: new Date(), emailTokenHash: null, emailTokenExpires: null },
    })
  }

  async list(params: { status?: PressCredentialStatus; page: number; limit: number }) {
    const where: Prisma.PressCredentialWhereInput = params.status ? { status: params.status } : {}
    const [data, total] = await Promise.all([
      this.prisma.pressCredential.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: { user: { select: USER_FOR_REVIEW }, reviewer: { select: { id: true, name: true } } },
      }),
      this.prisma.pressCredential.count({ where }),
    ])
    return { data, total }
  }

  /** Aprova: pedido PENDING com e-mail confirmado vira APPROVED e a conta vira PRESS verificada, tudo ou nada. */
  approve(id: string, reviewerId: string, reviewNote: string | null): Promise<TransitionResult> {
    return this.prisma.$transaction(async (tx) => {
      const credential = await tx.pressCredential.findUnique({
        where: { id },
        select: { status: true, emailConfirmedAt: true, userId: true, outletName: true },
      })
      if (!credential || credential.status !== PressCredentialStatus.PENDING) return { ok: false as const, reason: 'NOT_FOUND_OR_STATE' as const }
      if (!credential.emailConfirmedAt) return { ok: false as const, reason: 'EMAIL_NOT_CONFIRMED' as const }

      const user = await tx.user.findUnique({ where: { id: credential.userId }, select: { id: true, name: true, email: true, type: true } })
      if (!user || !CONVERTIBLE_TO_PRESS.includes(user.type)) return { ok: false as const, reason: 'USER_TYPE' as const }

      // `status: PENDING` no where: dois moderadores decidindo ao mesmo tempo, só um passa.
      const moved = await tx.pressCredential.updateMany({
        where: { id, status: PressCredentialStatus.PENDING },
        data: { status: PressCredentialStatus.APPROVED, reviewerId, reviewNote, reviewedAt: new Date() },
      })
      if (moved.count === 0) return { ok: false as const, reason: 'NOT_FOUND_OR_STATE' as const }

      await tx.user.update({ where: { id: user.id }, data: { type: UserType.PRESS, verified: true } })
      await tx.moderationAction.create({
        data: {
          action: ModerationActionType.USER_TYPE_CHANGED,
          targetType: 'USER',
          targetId: user.id,
          reason: `${user.type} → PRESS: credencial de imprensa aprovada (${credential.outletName}), pedido ${id}`,
          actorId: reviewerId,
        },
      })
      return { ok: true as const, userId: user.id, outletName: credential.outletName, email: user.email, name: user.name }
    })
  }

  reject(id: string, reviewerId: string, reviewNote: string): Promise<TransitionResult> {
    return this.prisma.$transaction(async (tx) => {
      const credential = await tx.pressCredential.findUnique({
        where: { id },
        select: { status: true, userId: true, outletName: true, user: { select: { name: true, email: true } } },
      })
      if (!credential) return { ok: false as const, reason: 'NOT_FOUND_OR_STATE' as const }
      const moved = await tx.pressCredential.updateMany({
        where: { id, status: PressCredentialStatus.PENDING },
        data: { status: PressCredentialStatus.REJECTED, reviewerId, reviewNote, reviewedAt: new Date() },
      })
      if (moved.count === 0) return { ok: false as const, reason: 'NOT_FOUND_OR_STATE' as const }
      return { ok: true as const, userId: credential.userId, outletName: credential.outletName, email: credential.user.email, name: credential.user.name }
    })
  }

  /** Cancela uma credencial aprovada: a conta volta a ser cidadã, perde o selo e as sessões abertas caem. */
  revoke(id: string, reviewerId: string, reviewNote: string): Promise<TransitionResult> {
    return this.prisma.$transaction(async (tx) => {
      const credential = await tx.pressCredential.findUnique({
        where: { id },
        select: { status: true, userId: true, outletName: true, user: { select: { name: true, email: true, type: true } } },
      })
      if (!credential) return { ok: false as const, reason: 'NOT_FOUND_OR_STATE' as const }
      const moved = await tx.pressCredential.updateMany({
        where: { id, status: PressCredentialStatus.APPROVED },
        data: { status: PressCredentialStatus.REVOKED, reviewerId, reviewNote, reviewedAt: new Date() },
      })
      if (moved.count === 0) return { ok: false as const, reason: 'NOT_FOUND_OR_STATE' as const }

      // Só desfaz se a conta ainda é PRESS (o admin pode ter mudado o papel por outro caminho).
      if (credential.user.type === UserType.PRESS) {
        await tx.user.update({ where: { id: credential.userId }, data: { type: UserType.CITIZEN, verified: false } })
        await tx.moderationAction.create({
          data: {
            action: ModerationActionType.USER_TYPE_CHANGED,
            targetType: 'USER',
            targetId: credential.userId,
            reason: `PRESS → CITIZEN: credencial de imprensa cancelada (${credential.outletName}), pedido ${id}: ${reviewNote}`,
            actorId: reviewerId,
          },
        })
        await tx.refreshToken.updateMany({ where: { userId: credential.userId, revokedAt: null }, data: { revokedAt: new Date() } })
      }
      return { ok: true as const, userId: credential.userId, outletName: credential.outletName, email: credential.user.email, name: credential.user.name }
    })
  }
}
