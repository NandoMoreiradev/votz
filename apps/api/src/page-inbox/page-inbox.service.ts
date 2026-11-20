import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import * as DOMPurify from 'isomorphic-dompurify'
import { OrgType, PageConversationStatus, PageMessageSender, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CryptoService } from '../crypto/crypto.service'
import { OrgMembershipsRepository } from '../org-memberships/org-memberships.repository'

export const PAGE_MESSAGE_MAX = 2000
/** Teto de mensagens do cidadão por conversa por dia, contra spam. */
export const CITIZEN_DAILY_LIMIT = 50
const PAGE_SIZE = 20

export type PageSummary = {
  orgType: OrgType
  orgId: string
  name: string
  username: string | null
  avatarUrl: string | null
}

export type SentMessage = {
  conversationId: string
  message: { id: string; from: PageMessageSender; text: string; createdAt: Date }
}

/**
 * Caixa de entrada da página (político, entidade, empresa).
 *
 * NÃO é ponta a ponta (decisão do dono, 20/11/2026): o texto fica cifrado no banco
 * com a chave do servidor, a equipe com READ_MESSAGES lê, com REPLY_MESSAGES responde,
 * e cada abertura por alguém da equipe fica registrada em `PageConversationRead`.
 */
@Injectable()
export class PageInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly memberships: OrgMembershipsRepository,
  ) {}

  // ── Páginas ────────────────────────────────────────────────────────────────

  async pageSummary(orgType: OrgType, orgId: string): Promise<PageSummary | null> {
    switch (orgType) {
      case OrgType.ENTITY: {
        const e = await this.prisma.entity.findUnique({
          where: { id: orgId },
          select: { legalName: true, username: true, logoUrl: true },
        })
        return e && { orgType, orgId, name: e.legalName, username: e.username, avatarUrl: e.logoUrl }
      }
      case OrgType.POLITICIAN: {
        const p = await this.prisma.politician.findUnique({
          where: { id: orgId },
          select: { name: true, username: true, avatarUrl: true },
        })
        return p && { orgType, orgId, name: p.name, username: p.username, avatarUrl: p.avatarUrl }
      }
      default: {
        const c = await this.prisma.company.findUnique({
          where: { id: orgId },
          select: { tradeName: true, username: true, logoUrl: true },
        })
        return c && { orgType, orgId, name: c.tradeName, username: c.username, avatarUrl: c.logoUrl }
      }
    }
  }

  private async pagesById(rows: { orgType: OrgType; orgId: string }[]) {
    const unique = new Map(rows.map((r) => [`${r.orgType}:${r.orgId}`, r]))
    const found = await Promise.all([...unique.values()].map((r) => this.pageSummary(r.orgType, r.orgId)))
    return new Map(found.filter((p): p is PageSummary => !!p).map((p) => [`${p.orgType}:${p.orgId}`, p]))
  }

  // ── Texto ──────────────────────────────────────────────────────────────────

  private clean(text: string): string {
    const body = DOMPurify.sanitize(text ?? '', { ALLOWED_TAGS: [] }).trim()
    if (!body) throw new BadRequestException('Escreva uma mensagem.')
    if (body.length > PAGE_MESSAGE_MAX) {
      throw new BadRequestException(`A mensagem pode ter até ${PAGE_MESSAGE_MAX} caracteres.`)
    }
    return body
  }

  private view(m: { id: string; senderKind: PageMessageSender; bodyEnc: string; createdAt: Date; sender?: { name: string } }, staffView: boolean) {
    return {
      id: m.id,
      from: m.senderKind,
      text: this.crypto.decrypt(m.bodyEnc),
      createdAt: m.createdAt,
      // O cidadão vê "a página"; só a equipe vê quem respondeu.
      ...(staffView && m.senderKind === 'STAFF' && m.sender ? { staffName: m.sender.name } : {}),
    }
  }

  // ── Cidadão ────────────────────────────────────────────────────────────────

  async sendAsCitizen(userId: string, orgType: OrgType, orgId: string, text: string): Promise<SentMessage> {
    const page = await this.pageSummary(orgType, orgId)
    if (!page) throw new NotFoundException('Página não encontrada')
    if (await this.memberships.findMembership(userId, orgType, orgId)) {
      throw new ForbiddenException('Você faz parte da equipe desta página.')
    }
    const body = this.clean(text)
    const bodyEnc = this.crypto.encrypt(body)

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.pageConversation.findUnique({
          where: { orgType_orgId_citizenId: { orgType, orgId, citizenId: userId } },
        })
        if (existing?.status === PageConversationStatus.BLOCKED) {
          throw new ForbiddenException('Esta página não está recebendo mensagens suas.')
        }
        if (existing) {
          const since = new Date(Date.now() - 24 * 3_600_000)
          const today = await tx.pageMessage.count({
            where: { conversationId: existing.id, senderKind: 'CITIZEN', createdAt: { gte: since } },
          })
          if (today >= CITIZEN_DAILY_LIMIT) {
            throw new ConflictException('Muitas mensagens hoje. Tente de novo amanhã.')
          }
        }
        const now = new Date()
        const conversation = existing
          ? await tx.pageConversation.update({
              where: { id: existing.id },
              data: {
                status: PageConversationStatus.OPEN,
                lastMessageAt: now,
                lastSender: 'CITIZEN',
                staffUnread: { increment: 1 },
              },
            })
          : await tx.pageConversation.create({
              data: { orgType, orgId, citizenId: userId, lastMessageAt: now, lastSender: 'CITIZEN', staffUnread: 1 },
            })
        const message = await tx.pageMessage.create({
          data: { conversationId: conversation.id, senderId: userId, senderKind: 'CITIZEN', bodyEnc },
        })
        return { conversationId: conversation.id, message: this.view(message, false) }
      })
    } catch (err) {
      // Primeira mensagem enviada em dobro (dois cliques): a segunda tentativa acha a conversa pronta.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.sendAsCitizen(userId, orgType, orgId, text)
      }
      throw err
    }
  }

  async myConversations(userId: string, page = 1) {
    const where = { citizenId: userId }
    const [total, rows] = await Promise.all([
      this.prisma.pageConversation.count({ where }),
      this.prisma.pageConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
    ])
    const pages = await this.pagesById(rows)
    const items = rows.flatMap((c) => {
      const p = pages.get(`${c.orgType}:${c.orgId}`)
      if (!p) return []
      const last = c.messages[0]
      return [{
        id: c.id,
        page: p,
        status: c.status,
        unread: c.citizenUnread,
        lastMessageAt: c.lastMessageAt,
        lastText: last ? this.crypto.decrypt(last.bodyEnc).slice(0, 140) : '',
        lastFrom: c.lastSender,
      }]
    })
    return { items, total, page, limit: PAGE_SIZE }
  }

  /** Conversa do cidadão com uma página específica (para o botão "Mensagem" do perfil). */
  async myThreadWithPage(userId: string, orgType: OrgType, orgId: string) {
    const c = await this.prisma.pageConversation.findUnique({
      where: { orgType_orgId_citizenId: { orgType, orgId, citizenId: userId } },
      select: { id: true, status: true },
    })
    return { conversation: c }
  }

  async myConversation(userId: string, id: string) {
    const c = await this.prisma.pageConversation.findFirst({
      where: { id, citizenId: userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!c) throw new NotFoundException('Conversa não encontrada')
    if (c.citizenUnread) {
      await this.prisma.pageConversation.update({ where: { id }, data: { citizenUnread: 0 } })
    }
    const page = await this.pageSummary(c.orgType, c.orgId)
    return {
      id: c.id,
      page,
      status: c.status,
      messages: c.messages.map((m) => this.view(m, false)),
    }
  }

  /** LGPD: o cidadão apaga a própria conversa (some também para a equipe). */
  async deleteMine(userId: string, id: string) {
    const { count } = await this.prisma.pageConversation.deleteMany({ where: { id, citizenId: userId } })
    if (!count) throw new NotFoundException('Conversa não encontrada')
    return { deleted: true }
  }

  // ── Equipe ─────────────────────────────────────────────────────────────────

  async listForStaff(orgType: OrgType, orgId: string, status: PageConversationStatus | undefined, page = 1) {
    const where: Prisma.PageConversationWhereInput = { orgType, orgId, ...(status ? { status } : {}) }
    const [total, rows] = await Promise.all([
      this.prisma.pageConversation.count({ where }),
      this.prisma.pageConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          citizen: { select: { id: true, name: true, username: true, avatarUrl: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
    ])
    const items = rows.map((c) => ({
      id: c.id,
      citizen: c.citizen,
      status: c.status,
      unread: c.staffUnread,
      lastMessageAt: c.lastMessageAt,
      lastText: c.messages[0] ? this.crypto.decrypt(c.messages[0].bodyEnc).slice(0, 140) : '',
      lastFrom: c.lastSender,
    }))
    return { items, total, page, limit: PAGE_SIZE }
  }

  async openForStaff(staffId: string, orgType: OrgType, orgId: string, id: string) {
    const c = await this.prisma.pageConversation.findFirst({
      where: { id, orgType, orgId },
      include: {
        citizen: { select: { id: true, name: true, username: true, avatarUrl: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { name: true } } } },
      },
    })
    if (!c) throw new NotFoundException('Conversa não encontrada')
    // Auditoria: quem da equipe abriu e quando.
    await this.prisma.$transaction([
      this.prisma.pageConversationRead.upsert({
        where: { conversationId_userId: { conversationId: id, userId: staffId } },
        create: { conversationId: id, userId: staffId },
        update: { lastReadAt: new Date() },
      }),
      this.prisma.pageConversation.update({ where: { id }, data: { staffUnread: 0 } }),
    ])
    const readers = await this.prisma.pageConversationRead.findMany({
      where: { conversationId: id },
      orderBy: { lastReadAt: 'desc' },
      select: { lastReadAt: true, user: { select: { id: true, name: true } } },
    })
    return {
      id: c.id,
      citizen: c.citizen,
      status: c.status,
      messages: c.messages.map((m) => this.view(m, true)),
      readers: readers.map((r) => ({ userId: r.user.id, name: r.user.name, lastReadAt: r.lastReadAt })),
    }
  }

  async replyAsStaff(staffId: string, orgType: OrgType, orgId: string, id: string, text: string) {
    const body = this.clean(text)
    const c = await this.prisma.pageConversation.findFirst({ where: { id, orgType, orgId } })
    if (!c) throw new NotFoundException('Conversa não encontrada')
    if (c.status === PageConversationStatus.BLOCKED) {
      throw new ConflictException('Conversa bloqueada. Reabra para responder.')
    }
    const bodyEnc = this.crypto.encrypt(body)
    const [message] = await this.prisma.$transaction([
      this.prisma.pageMessage.create({
        data: { conversationId: id, senderId: staffId, senderKind: 'STAFF', bodyEnc },
        include: { sender: { select: { name: true } } },
      }),
      this.prisma.pageConversation.update({
        where: { id },
        data: { lastMessageAt: new Date(), lastSender: 'STAFF', citizenUnread: { increment: 1 } },
      }),
      // Quem responde também conta como quem leu.
      this.prisma.pageConversationRead.upsert({
        where: { conversationId_userId: { conversationId: id, userId: staffId } },
        create: { conversationId: id, userId: staffId },
        update: { lastReadAt: new Date() },
      }),
    ])
    return this.view(message, true)
  }

  async setStatus(orgType: OrgType, orgId: string, id: string, status: PageConversationStatus) {
    const { count } = await this.prisma.pageConversation.updateMany({
      where: { id, orgType, orgId },
      data: { status },
    })
    if (!count) throw new NotFoundException('Conversa não encontrada')
    return { id, status }
  }

  /** Quantas conversas esperam resposta (selo no painel da página). */
  async staffUnreadCount(orgType: OrgType, orgId: string) {
    const agg = await this.prisma.pageConversation.aggregate({
      where: { orgType, orgId, status: PageConversationStatus.OPEN },
      _sum: { staffUnread: true },
    })
    return { unread: agg._sum.staffUnread ?? 0 }
  }
}
