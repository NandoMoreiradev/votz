import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import * as DOMPurify from 'isomorphic-dompurify'
import { OrgType, PageConversationStatus, PageMessageSender, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CryptoService } from '../crypto/crypto.service'
import { OrgMembershipsRepository } from '../org-memberships/org-memberships.repository'
import { StorageService, detectMimeFromBuffer } from '../storage/storage.service'
import type { PageMediaDto } from './dto/page-inbox.dto'

export const PAGE_MESSAGE_MAX = 2000
/** Teto de mensagens do cidadão por conversa por dia, contra spam. */
export const CITIZEN_DAILY_LIMIT = 50
const PAGE_SIZE = 20
/** Teto diário de conversas novas que a PÁGINA começa (contra spam de página para seguidores). */
export const PAGE_STARTED_PER_DAY = 50
export const PAGE_MEDIA_MAX_BYTES = 50 * 1024 * 1024

const MEDIA_LIMITS: Record<'image' | 'video' | 'audio' | 'file', number> = {
  image: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  file: 25 * 1024 * 1024,
  video: 50 * 1024 * 1024,
}
const MEDIA_LABELS: Record<string, string> = {
  image: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
  file: 'Arquivo',
}
const BLOCKED_MIMES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/javascript',
  'text/javascript',
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
  'application/x-csh',
])
const THUMB_PATTERN = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/]+={0,2}$/

export type PageSummary = {
  orgType: OrgType
  orgId: string
  name: string
  username: string | null
  avatarUrl: string | null
}

export type PageAttachmentView = {
  id: string
  kind: 'image' | 'video' | 'audio' | 'file'
  name: string
  mimeType: string
  sizeBytes: number
  width?: number
  height?: number
  durationMs?: number
  thumbnail?: string
}

export type PageReplyView = {
  id: string
  from: PageMessageSender
  excerpt: string
}

export type PageMessageView = {
  id: string
  from: PageMessageSender
  text: string
  createdAt: Date
  staffName?: string
  replyTo?: PageReplyView
  attachment?: PageAttachmentView
}

export type SentMessage = {
  conversationId: string
  message: PageMessageView
}

const messageInclude = {
  attachment: true,
  replyTo: {
    select: {
      id: true,
      senderKind: true,
      bodyEnc: true,
      attachment: { select: { kind: true } },
    },
  },
} as const

type RawMessage = {
  id: string
  senderKind: PageMessageSender
  bodyEnc: string
  createdAt: Date
  sender?: { name: string }
  attachment?: {
    id: string
    kind: string
    mimeType: string
    nameEnc: string
    sizeBytes: number
    width: number | null
    height: number | null
    durationMs: number | null
    thumbnail: string | null
  } | null
  replyTo?: {
    id: string
    senderKind: PageMessageSender
    bodyEnc: string
    attachment?: { kind: string } | null
  } | null
}

/**
 * Caixa de entrada da página (político, entidade, empresa).
 *
 * NÃO é ponta a ponta (decisão do dono, 20/11/2026): texto e anexos ficam cifrados
 * no servidor, a equipe com READ_MESSAGES lê, com REPLY_MESSAGES responde,
 * e cada abertura por alguém da equipe fica registrada em `PageConversationRead`.
 */
@Injectable()
export class PageInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly memberships: OrgMembershipsRepository,
    @Optional() private readonly storage?: StorageService,
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

  // ── Texto e mídia ──────────────────────────────────────────────────────────

  private clean(text: string, allowEmpty = false): string {
    const body = DOMPurify.sanitize(text ?? '', { ALLOWED_TAGS: [] }).trim()
    if (!body && !allowEmpty) throw new BadRequestException('Escreva uma mensagem.')
    if (body.length > PAGE_MESSAGE_MAX) {
      throw new BadRequestException(`A mensagem pode ter até ${PAGE_MESSAGE_MAX} caracteres.`)
    }
    return body
  }

  private previewText(m?: { bodyEnc: string; attachment?: { kind: string } | null }): string {
    if (!m) return ''
    const text = m.bodyEnc ? this.crypto.decrypt(m.bodyEnc) : ''
    if (text) return text.slice(0, 140)
    return m.attachment ? (MEDIA_LABELS[m.attachment.kind] ?? 'Arquivo') : ''
  }

  private view(m: RawMessage, staffView: boolean): PageMessageView {
    const text = m.bodyEnc ? this.crypto.decrypt(m.bodyEnc) : ''
    let replyTo: PageReplyView | undefined
    if (m.replyTo) {
      const refText = m.replyTo.bodyEnc ? this.crypto.decrypt(m.replyTo.bodyEnc) : ''
      const excerpt = refText || (m.replyTo.attachment ? (MEDIA_LABELS[m.replyTo.attachment.kind] ?? 'Arquivo') : 'Mensagem')
      replyTo = { id: m.replyTo.id, from: m.replyTo.senderKind, excerpt: excerpt.slice(0, 120) }
    }
    const attachment: PageAttachmentView | undefined = m.attachment
      ? {
          id: m.attachment.id,
          kind: (['image', 'video', 'audio', 'file'].includes(m.attachment.kind) ? m.attachment.kind : 'file') as PageAttachmentView['kind'],
          name: this.crypto.decrypt(m.attachment.nameEnc),
          mimeType: m.attachment.mimeType,
          sizeBytes: m.attachment.sizeBytes,
          ...(m.attachment.width ? { width: m.attachment.width } : {}),
          ...(m.attachment.height ? { height: m.attachment.height } : {}),
          ...(m.attachment.durationMs ? { durationMs: m.attachment.durationMs } : {}),
          ...(m.attachment.thumbnail ? { thumbnail: m.attachment.thumbnail } : {}),
        }
      : undefined
    return {
      id: m.id,
      from: m.senderKind,
      text,
      createdAt: m.createdAt,
      // O cidadão vê "a página"; só a equipe vê quem respondeu.
      ...(staffView && m.senderKind === 'STAFF' && m.sender ? { staffName: m.sender.name } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(attachment ? { attachment } : {}),
    }
  }

  private prepareUpload(
    file: { buffer?: Buffer; originalname?: string; mimetype?: string } | undefined,
    meta: PageMediaDto,
  ) {
    if (!this.storage) throw new BadRequestException('Envio de arquivos indisponível no momento.')
    const buffer = file?.buffer
    if (!buffer || !buffer.length) throw new BadRequestException('Escolha um arquivo para enviar.')
    if (buffer.length > PAGE_MEDIA_MAX_BYTES) {
      throw new BadRequestException('O arquivo passa do limite máximo de 50 MB.')
    }
    const declared = (file?.mimetype || '').split(';')[0].trim().toLowerCase()
    if (BLOCKED_MIMES.has(declared)) {
      throw new BadRequestException('Este tipo de arquivo não é permitido.')
    }
    const sniffed = detectMimeFromBuffer(buffer)
    // WebM de vídeo e de áudio têm o mesmo cabeçalho EBML; respeita `video/webm` se veio do gravador/vídeo.
    const mimeType =
      sniffed === 'audio/webm' && declared === 'video/webm'
        ? 'video/webm'
        : sniffed || declared || 'application/octet-stream'
    if (BLOCKED_MIMES.has(mimeType)) {
      throw new BadRequestException('Este tipo de arquivo não é permitido.')
    }
    const kind: PageAttachmentView['kind'] = mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('video/')
        ? 'video'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : 'file'
    const limit = MEDIA_LIMITS[kind]
    if (buffer.length > limit) {
      const mb = Math.round(limit / (1024 * 1024))
      throw new BadRequestException(`${MEDIA_LABELS[kind]} pode ter até ${mb} MB.`)
    }
    const rawName = (file?.originalname || 'arquivo').replace(/[\r\n\0/\\]/g, '').trim()
    const name = (rawName || 'arquivo').slice(0, 180)
    const thumbnail =
      meta.thumbnail && meta.thumbnail.length <= 24_000 && THUMB_PATTERN.test(meta.thumbnail)
        ? meta.thumbnail
        : undefined
    const caption = this.clean(meta.caption ?? '', true)
    return { buffer, mimeType, kind, name, thumbnail, caption }
  }

  private async validReplyToId(
    tx: Pick<PrismaService, 'pageMessage'>,
    conversationId: string,
    replyToId?: string,
  ): Promise<string | undefined> {
    if (!replyToId) return undefined
    const target = await tx.pageMessage.findFirst({
      where: { id: replyToId, conversationId },
      select: { id: true },
    })
    if (!target) throw new BadRequestException('Mensagem respondida não encontrada.')
    return target.id
  }

  // ── Cidadão ────────────────────────────────────────────────────────────────

  async sendAsCitizen(
    userId: string,
    orgType: OrgType,
    orgId: string,
    text: string,
    replyToId?: string,
  ): Promise<SentMessage> {
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
        // Bloqueada pela página: não escreve. Recusada pelo próprio cidadão (citizenAccepted = false): pode voltar.
        if (existing?.status === PageConversationStatus.BLOCKED && existing.citizenAccepted) {
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
        const validReply = existing ? await this.validReplyToId(tx, existing.id, replyToId) : undefined
        const now = new Date()
        const conversation = existing
          ? await tx.pageConversation.update({
              where: { id: existing.id },
              data: {
                status: PageConversationStatus.OPEN,
                // Responder a uma conversa que a página começou é aceitar.
                citizenAccepted: true,
                lastMessageAt: now,
                lastSender: 'CITIZEN',
                staffUnread: { increment: 1 },
              },
            })
          : await tx.pageConversation.create({
              data: { orgType, orgId, citizenId: userId, lastMessageAt: now, lastSender: 'CITIZEN', staffUnread: 1 },
            })
        const message = await tx.pageMessage.create({
          data: {
            conversationId: conversation.id,
            senderId: userId,
            senderKind: 'CITIZEN',
            bodyEnc,
            ...(validReply ? { replyToId: validReply } : {}),
          },
          include: messageInclude,
        })
        return { conversationId: conversation.id, message: this.view(message, false) }
      })
    } catch (err) {
      // Primeira mensagem enviada em dobro (dois cliques): a segunda tentativa acha a conversa pronta.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.sendAsCitizen(userId, orgType, orgId, text, replyToId)
      }
      throw err
    }
  }

  async sendMediaAsCitizen(
    userId: string,
    orgType: OrgType,
    orgId: string,
    file: { buffer?: Buffer; originalname?: string; mimetype?: string } | undefined,
    meta: PageMediaDto,
  ): Promise<SentMessage> {
    const page = await this.pageSummary(orgType, orgId)
    if (!page) throw new NotFoundException('Página não encontrada')
    if (await this.memberships.findMembership(userId, orgType, orgId)) {
      throw new ForbiddenException('Você faz parte da equipe desta página.')
    }
    const prepared = this.prepareUpload(file, meta)
    const existing = await this.prisma.pageConversation.findUnique({
      where: { orgType_orgId_citizenId: { orgType, orgId, citizenId: userId } },
    })
    if (existing?.status === PageConversationStatus.BLOCKED && existing.citizenAccepted) {
      throw new ForbiddenException('Esta página não está recebendo mensagens suas.')
    }
    if (existing) {
      const since = new Date(Date.now() - 24 * 3_600_000)
      const today = await this.prisma.pageMessage.count({
        where: { conversationId: existing.id, senderKind: 'CITIZEN', createdAt: { gte: since } },
      })
      if (today >= CITIZEN_DAILY_LIMIT) {
        throw new ConflictException('Muitas mensagens hoje. Tente de novo amanhã.')
      }
    }
    const attachmentId = randomUUID()
    const conversationId = existing?.id ?? randomUUID()
    const objectKey = `page-media/${conversationId}/${attachmentId}.enc`
    const encryptedBlob = this.crypto.encryptBuffer(prepared.buffer)
    await this.storage!.uploadEncryptedBlob(objectKey, encryptedBlob)

    const bodyEnc = prepared.caption ? this.crypto.encrypt(prepared.caption) : ''
    const nameEnc = this.crypto.encrypt(prepared.name)
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.pageConversation.findUnique({
          where: { orgType_orgId_citizenId: { orgType, orgId, citizenId: userId } },
        })
        if (current?.status === PageConversationStatus.BLOCKED && current.citizenAccepted) {
          throw new ForbiddenException('Esta página não está recebendo mensagens suas.')
        }
        const validReply = current ? await this.validReplyToId(tx, current.id, meta.replyToId) : undefined
        const now = new Date()
        const conversation = current
          ? await tx.pageConversation.update({
              where: { id: current.id },
              data: {
                status: PageConversationStatus.OPEN,
                citizenAccepted: true,
                lastMessageAt: now,
                lastSender: 'CITIZEN',
                staffUnread: { increment: 1 },
              },
            })
          : await tx.pageConversation.create({
              data: {
                id: conversationId,
                orgType,
                orgId,
                citizenId: userId,
                lastMessageAt: now,
                lastSender: 'CITIZEN',
                staffUnread: 1,
              },
            })
        const message = await tx.pageMessage.create({
          data: {
            conversationId: conversation.id,
            senderId: userId,
            senderKind: 'CITIZEN',
            bodyEnc,
            ...(validReply ? { replyToId: validReply } : {}),
            attachment: {
              create: {
                id: attachmentId,
                conversationId: conversation.id,
                objectKey,
                kind: prepared.kind,
                mimeType: prepared.mimeType,
                nameEnc,
                sizeBytes: prepared.buffer.length,
                width: meta.width ?? null,
                height: meta.height ?? null,
                durationMs: meta.durationMs ?? null,
                thumbnail: prepared.thumbnail ?? null,
              },
            },
          },
          include: messageInclude,
        })
        return { conversationId: conversation.id, message: this.view(message, false) }
      })
    } catch (err) {
      await this.storage?.delete(objectKey).catch(() => {})
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.sendMediaAsCitizen(userId, orgType, orgId, file, meta)
      }
      throw err
    }
  }

  async myConversations(userId: string, page = 1) {
    // Conversas que o próprio cidadão recusou somem da caixa (podem ser reabertas pelo perfil da página).
    const where: Prisma.PageConversationWhereInput = {
      citizenId: userId,
      NOT: { status: PageConversationStatus.BLOCKED, citizenAccepted: false },
    }
    const [total, rows] = await Promise.all([
      this.prisma.pageConversation.count({ where }),
      this.prisma.pageConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { attachment: { select: { kind: true } } },
          },
        },
      }),
    ])
    const pages = await this.pagesById(rows)
    const items = rows.flatMap((c) => {
      const p = pages.get(`${c.orgType}:${c.orgId}`)
      if (!p) return []
      return [{
        id: c.id,
        page: p,
        status: c.status,
        unread: c.citizenUnread,
        startedBy: c.startedBy,
        accepted: c.citizenAccepted,
        lastMessageAt: c.lastMessageAt,
        lastText: this.previewText(c.messages[0]),
        lastFrom: c.lastSender,
      }]
    })
    return { items, total, page, limit: PAGE_SIZE }
  }

  /** Conversa do cidadão com uma página específica (para o botão "Mensagem" do perfil). */
  async myThreadWithPage(userId: string, orgType: OrgType, orgId: string) {
    const [c, page] = await Promise.all([
      this.prisma.pageConversation.findUnique({
        where: { orgType_orgId_citizenId: { orgType, orgId, citizenId: userId } },
        select: { id: true, status: true },
      }),
      // A tela de conversa (em /conversas) mostra nome e foto da página mesmo antes da primeira mensagem.
      this.pageSummary(orgType, orgId),
    ])
    if (!page) throw new NotFoundException('Página não encontrada')
    return { conversation: c, page }
  }

  async myConversation(userId: string, id: string) {
    const c = await this.prisma.pageConversation.findFirst({
      where: { id, citizenId: userId },
      include: { messages: { orderBy: { createdAt: 'asc' }, include: messageInclude } },
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
      startedBy: c.startedBy,
      accepted: c.citizenAccepted,
      messages: c.messages.map((m) => this.view(m, false)),
    }
  }

  async downloadMediaForCitizen(userId: string, conversationId: string, attachmentId: string) {
    if (!this.storage) throw new NotFoundException('Arquivo não encontrado')
    const conv = await this.prisma.pageConversation.findFirst({
      where: { id: conversationId, citizenId: userId },
      select: { id: true },
    })
    if (!conv) throw new NotFoundException('Arquivo não encontrado')
    return this.decryptStoredAttachment(conversationId, attachmentId)
  }

  /** LGPD: o cidadão apaga a própria conversa (some também para a equipe, junto com os anexos). */
  async deleteMine(userId: string, id: string) {
    const existing = await this.prisma.pageConversation.findFirst({
      where: { id, citizenId: userId },
      select: { id: true, attachments: { select: { objectKey: true } } },
    })
    if (!existing) throw new NotFoundException('Conversa não encontrada')
    const { count } = await this.prisma.pageConversation.deleteMany({ where: { id, citizenId: userId } })
    if (!count) throw new NotFoundException('Conversa não encontrada')
    if (this.storage && existing.attachments?.length) {
      await Promise.allSettled(existing.attachments.map((a) => this.storage!.delete(a.objectKey)))
    }
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
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { attachment: { select: { kind: true } } },
          },
        },
      }),
    ])
    const items = rows.map((c) => ({
      id: c.id,
      citizen: c.citizen,
      status: c.status,
      unread: c.staffUnread,
      startedBy: c.startedBy,
      accepted: c.citizenAccepted,
      lastMessageAt: c.lastMessageAt,
      lastText: this.previewText(c.messages[0]),
      lastFrom: c.lastSender,
    }))
    return { items, total, page, limit: PAGE_SIZE }
  }

  async openForStaff(staffId: string, orgType: OrgType, orgId: string, id: string) {
    const c = await this.prisma.pageConversation.findFirst({
      where: { id, orgType, orgId },
      include: {
        citizen: { select: { id: true, name: true, username: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { ...messageInclude, sender: { select: { name: true } } },
        },
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
      startedBy: c.startedBy,
      accepted: c.citizenAccepted,
      messages: c.messages.map((m) => this.view(m, true)),
      readers: readers.map((r) => ({ userId: r.user.id, name: r.user.name, lastReadAt: r.lastReadAt })),
    }
  }

  async replyAsStaff(
    staffId: string,
    orgType: OrgType,
    orgId: string,
    id: string,
    text: string,
    replyToId?: string,
  ) {
    const body = this.clean(text)
    const c = await this.prisma.pageConversation.findFirst({ where: { id, orgType, orgId } })
    if (!c) throw new NotFoundException('Conversa não encontrada')
    if (c.status === PageConversationStatus.BLOCKED) {
      throw new ConflictException('Conversa bloqueada. Reabra para responder.')
    }
    if (c.startedBy === 'STAFF' && !c.citizenAccepted) {
      throw new ConflictException('Aguarde a pessoa aceitar a conversa para enviar mais mensagens.')
    }
    const validReply = await this.validReplyToId(this.prisma, id, replyToId)
    const bodyEnc = this.crypto.encrypt(body)
    const [message] = await this.prisma.$transaction([
      this.prisma.pageMessage.create({
        data: {
          conversationId: id,
          senderId: staffId,
          senderKind: 'STAFF',
          bodyEnc,
          ...(validReply ? { replyToId: validReply } : {}),
        },
        include: { ...messageInclude, sender: { select: { name: true } } },
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

  async replyMediaAsStaff(
    staffId: string,
    orgType: OrgType,
    orgId: string,
    id: string,
    file: { buffer?: Buffer; originalname?: string; mimetype?: string } | undefined,
    meta: PageMediaDto,
  ) {
    const c = await this.prisma.pageConversation.findFirst({ where: { id, orgType, orgId } })
    if (!c) throw new NotFoundException('Conversa não encontrada')
    if (c.status === PageConversationStatus.BLOCKED) {
      throw new ConflictException('Conversa bloqueada. Reabra para responder.')
    }
    if (c.startedBy === 'STAFF' && !c.citizenAccepted) {
      throw new ConflictException('Aguarde a pessoa aceitar a conversa para enviar mais mensagens.')
    }
    const prepared = this.prepareUpload(file, meta)
    const validReply = await this.validReplyToId(this.prisma, id, meta.replyToId)
    const attachmentId = randomUUID()
    const objectKey = `page-media/${id}/${attachmentId}.enc`
    await this.storage!.uploadEncryptedBlob(objectKey, this.crypto.encryptBuffer(prepared.buffer))

    const bodyEnc = prepared.caption ? this.crypto.encrypt(prepared.caption) : ''
    const nameEnc = this.crypto.encrypt(prepared.name)
    try {
      const [message] = await this.prisma.$transaction([
        this.prisma.pageMessage.create({
          data: {
            conversationId: id,
            senderId: staffId,
            senderKind: 'STAFF',
            bodyEnc,
            ...(validReply ? { replyToId: validReply } : {}),
            attachment: {
              create: {
                id: attachmentId,
                conversationId: id,
                objectKey,
                kind: prepared.kind,
                mimeType: prepared.mimeType,
                nameEnc,
                sizeBytes: prepared.buffer.length,
                width: meta.width ?? null,
                height: meta.height ?? null,
                durationMs: meta.durationMs ?? null,
                thumbnail: prepared.thumbnail ?? null,
              },
            },
          },
          include: { ...messageInclude, sender: { select: { name: true } } },
        }),
        this.prisma.pageConversation.update({
          where: { id },
          data: { lastMessageAt: new Date(), lastSender: 'STAFF', citizenUnread: { increment: 1 } },
        }),
        this.prisma.pageConversationRead.upsert({
          where: { conversationId_userId: { conversationId: id, userId: staffId } },
          create: { conversationId: id, userId: staffId },
          update: { lastReadAt: new Date() },
        }),
      ])
      return this.view(message, true)
    } catch (err) {
      await this.storage?.delete(objectKey).catch(() => {})
      throw err
    }
  }

  async downloadMediaForStaff(orgType: OrgType, orgId: string, conversationId: string, attachmentId: string) {
    if (!this.storage) throw new NotFoundException('Arquivo não encontrado')
    const conv = await this.prisma.pageConversation.findFirst({
      where: { id: conversationId, orgType, orgId },
      select: { id: true },
    })
    if (!conv) throw new NotFoundException('Arquivo não encontrado')
    return this.decryptStoredAttachment(conversationId, attachmentId)
  }

  private async decryptStoredAttachment(conversationId: string, attachmentId: string) {
    const att = await this.prisma.pageAttachment.findFirst({
      where: { id: attachmentId, conversationId },
    })
    if (!att) throw new NotFoundException('Arquivo não encontrado')
    const encrypted = await this.storage!.downloadEncryptedBlob(att.objectKey)
    return {
      buffer: this.crypto.decryptBuffer(encrypted),
      mimeType: att.mimeType,
      name: this.crypto.decrypt(att.nameEnc),
      kind: att.kind,
    }
  }

  async setStatus(orgType: OrgType, orgId: string, id: string, status: PageConversationStatus) {
    const { count } = await this.prisma.pageConversation.updateMany({
      where: { id, orgType, orgId },
      // Bloquear vale mais que "recusou": a pessoa não reabre sozinha uma conversa bloqueada pela página.
      data: status === PageConversationStatus.BLOCKED ? { status, citizenAccepted: true } : { status },
    })
    if (!count) throw new NotFoundException('Conversa não encontrada')
    return { id, status }
  }

  // ── A página começa a conversa ──────────────────────────────────────────────

  /** Seguidores da página que a equipe pode chamar (a busca é opcional). */
  async followersForStaff(orgType: OrgType, orgId: string, q?: string) {
    const term = q?.trim()
    const user: Prisma.UserWhereInput = {
      banned: false,
      emailVerified: true,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { username: { contains: term.replace(/^@/, ''), mode: 'insensitive' } },
            ],
          }
        : {}),
      pageConversations: { none: { orgType, orgId, status: PageConversationStatus.BLOCKED, citizenAccepted: true } },
    }
    const select = { user: { select: { id: true, name: true, username: true, avatarUrl: true } } }
    const take = 30
    const orderBy = { user: { name: 'asc' as const } }
    const rows =
      orgType === OrgType.POLITICIAN
        ? await this.prisma.userPoliticianFollower.findMany({ where: { politicianId: orgId, user }, select, orderBy, take })
        : orgType === OrgType.ENTITY
          ? await this.prisma.userEntityFollower.findMany({ where: { entityId: orgId, user }, select, orderBy, take })
          : await this.prisma.userCompanyFollower.findMany({ where: { companyId: orgId, user }, select, orderBy, take })
    return { items: rows.map((r) => r.user) }
  }

  private async followsPage(userId: string, orgType: OrgType, orgId: string) {
    const n =
      orgType === OrgType.POLITICIAN
        ? await this.prisma.userPoliticianFollower.count({ where: { userId, politicianId: orgId } })
        : orgType === OrgType.ENTITY
          ? await this.prisma.userEntityFollower.count({ where: { userId, entityId: orgId } })
          : await this.prisma.userCompanyFollower.count({ where: { userId, companyId: orgId } })
    return n > 0
  }

  /**
   * A página começa uma conversa com um seguidor. A pessoa precisa ACEITAR (ou recusar) antes
   * de a página mandar mais mensagens; recusar bloqueia a página só nessa conversa.
   */
  async startAsStaff(staffId: string, orgType: OrgType, orgId: string, citizenId: string, text: string) {
    const body = this.clean(text)
    if (citizenId === staffId) throw new BadRequestException('Escolha outra pessoa.')
    const citizen = await this.prisma.user.findFirst({
      where: { id: citizenId, banned: false, emailVerified: true },
      select: { id: true },
    })
    if (!citizen) throw new NotFoundException('Pessoa não encontrada.')
    if (await this.memberships.findMembership(citizenId, orgType, orgId)) {
      throw new BadRequestException('Esta pessoa faz parte da equipe da página.')
    }
    if (!(await this.followsPage(citizenId, orgType, orgId))) {
      throw new ForbiddenException('Só é possível começar conversa com quem segue a página.')
    }
    const existing = await this.prisma.pageConversation.findUnique({
      where: { orgType_orgId_citizenId: { orgType, orgId, citizenId } },
      select: { id: true },
    })
    if (existing) {
      // Já existe conversa: é uma resposta comum, com as mesmas travas.
      const message = await this.replyAsStaff(staffId, orgType, orgId, existing.id, text)
      return { conversationId: existing.id, created: false, message }
    }
    const since = new Date(Date.now() - 24 * 3_600_000)
    const startedToday = await this.prisma.pageConversation.count({
      where: { orgType, orgId, startedBy: 'STAFF', createdAt: { gte: since } },
    })
    if (startedToday >= PAGE_STARTED_PER_DAY) {
      throw new HttpException('A página já começou muitas conversas hoje. Tente de novo amanhã.', HttpStatus.TOO_MANY_REQUESTS)
    }
    const bodyEnc = this.crypto.encrypt(body)
    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.pageConversation.create({
        data: {
          orgType,
          orgId,
          citizenId,
          startedBy: 'STAFF',
          citizenAccepted: false,
          lastSender: 'STAFF',
          citizenUnread: 1,
          staffUnread: 0,
        },
      })
      const message = await tx.pageMessage.create({
        data: { conversationId: conversation.id, senderId: staffId, senderKind: 'STAFF', bodyEnc },
        include: { ...messageInclude, sender: { select: { name: true } } },
      })
      await tx.pageConversationRead.create({ data: { conversationId: conversation.id, userId: staffId } })
      return { conversation, message }
    })
    return { conversationId: result.conversation.id, created: true, message: this.view(result.message, true) }
  }

  /** O cidadão aceita ou recusa uma conversa que a página começou. */
  async respondAsCitizen(userId: string, id: string, accept: boolean) {
    const c = await this.prisma.pageConversation.findFirst({ where: { id, citizenId: userId } })
    if (!c) throw new NotFoundException('Conversa não encontrada')
    if (c.status === PageConversationStatus.BLOCKED && c.citizenAccepted) {
      throw new ForbiddenException('Esta página bloqueou a conversa.')
    }
    if (accept) {
      const u = await this.prisma.pageConversation.update({
        where: { id },
        data: { citizenAccepted: true, status: PageConversationStatus.OPEN },
      })
      return { id, accepted: true, status: u.status }
    }
    const u = await this.prisma.pageConversation.update({
      where: { id },
      data: { citizenAccepted: false, status: PageConversationStatus.BLOCKED, citizenUnread: 0 },
    })
    return { id, accepted: false, status: u.status }
  }

  /** Quantas mensagens de páginas o cidadão ainda não abriu (selo unificado). */
  async citizenUnreadCount(userId: string) {
    const agg = await this.prisma.pageConversation.aggregate({
      where: {
        citizenId: userId,
        NOT: { status: PageConversationStatus.BLOCKED, citizenAccepted: false },
      },
      _sum: { citizenUnread: true },
    })
    return { unread: agg._sum.citizenUnread ?? 0 }
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
