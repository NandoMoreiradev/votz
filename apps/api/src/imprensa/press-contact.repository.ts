import { Injectable } from '@nestjs/common'
import { PressContactDeclineReason, PressContactStatus, PressOutletType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface NewContactRequest {
  journalistId: string
  recipientId: string
  reportId: string
  outletName: string
  outletType: PressOutletType
  outletWebsite: string
  message: string
  expiresAt: Date
}

@Injectable()
export class PressContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  findReport(id: string) {
    return this.prisma.report.findUnique({
      where: { id },
      select: {
        id: true, title: true, anonymous: true, pressContactOk: true, authorId: true,
        author: { select: { id: true, name: true, email: true, banned: true, emailVerified: true } },
      },
    })
  }

  setReportOptIn(id: string, pressContactOk: boolean) {
    return this.prisma.report.update({ where: { id }, data: { pressContactOk }, select: { id: true, pressContactOk: true } })
  }

  isBlocked(recipientId: string, journalistId: string) {
    return this.prisma.pressContactBlock.findUnique({
      where: { recipientId_journalistId: { recipientId, journalistId } },
      select: { id: true },
    })
  }

  blockJournalist(recipientId: string, journalistId: string) {
    return this.prisma.pressContactBlock.upsert({
      where: { recipientId_journalistId: { recipientId, journalistId } },
      create: { recipientId, journalistId },
      update: {},
    })
  }

  countAbusive(journalistId: string) {
    return this.prisma.pressContactRequest.count({
      where: { journalistId, declineReason: PressContactDeclineReason.ABUSIVE },
    })
  }

  findForReport(journalistId: string, reportId: string) {
    return this.prisma.pressContactRequest.findUnique({
      where: { journalistId_reportId: { journalistId, reportId } },
      select: { id: true, status: true },
    })
  }

  findRecentDecline(journalistId: string, recipientId: string, since: Date) {
    return this.prisma.pressContactRequest.findFirst({
      where: { journalistId, recipientId, status: PressContactStatus.DECLINED, respondedAt: { gte: since } },
      select: { id: true },
    })
  }

  findCredential(id: string) {
    return this.prisma.pressCredential.findUnique({
      where: { id },
      select: { outletName: true, outletType: true, website: true, status: true },
    })
  }

  create(data: NewContactRequest) {
    return this.prisma.pressContactRequest.create({ data })
  }

  listReceived(recipientId: string, take = 50) {
    return this.prisma.pressContactRequest.findMany({
      where: { recipientId, status: { not: PressContactStatus.CANCELLED } },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        journalist: { select: { id: true, name: true, type: true, verified: true } },
        report: { select: { id: true, title: true } },
      },
    })
  }

  listSent(journalistId: string, take = 50) {
    return this.prisma.pressContactRequest.findMany({
      where: { journalistId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        recipient: { select: { name: true } },
        report: { select: { id: true, title: true } },
      },
    })
  }

  findForRecipient(id: string, recipientId: string) {
    return this.prisma.pressContactRequest.findFirst({
      where: { id, recipientId },
      include: {
        journalist: { select: { id: true, name: true, type: true, verified: true, banned: true } },
        report: { select: { id: true, title: true } },
      },
    })
  }

  findForJournalist(id: string, journalistId: string) {
    return this.prisma.pressContactRequest.findFirst({
      where: { id, journalistId },
      select: { id: true, status: true, expiresAt: true },
    })
  }

  /** Só muda se ainda estiver PENDENTE (dois cliques ou duas abas: só um passa). */
  async respond(
    id: string,
    data: {
      status: PressContactStatus
      reply?: string | null
      viaVotzChat?: boolean
      declineReason?: PressContactDeclineReason | null
    },
    now: Date,
  ): Promise<boolean> {
    const res = await this.prisma.pressContactRequest.updateMany({
      where: { id, status: PressContactStatus.PENDING, expiresAt: { gt: now } },
      data: { ...data, respondedAt: now },
    })
    return res.count === 1
  }

  async cancel(id: string, now: Date): Promise<boolean> {
    const res = await this.prisma.pressContactRequest.updateMany({
      where: { id, status: PressContactStatus.PENDING },
      data: { status: PressContactStatus.CANCELLED, respondedAt: now },
    })
    return res.count === 1
  }
}
