import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { ChatMatrixService } from './chat-matrix.service'
import {
  ConversationListDto,
  ConversationPaginationDto,
  GroupConversationDto,
} from './conversations.dto'

const publicUser = {
  id: true,
  name: true,
  username: true,
  avatarUrl: true,
  verified: true,
} as const
const include = {
  members: {
    include: { user: { select: publicUser } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ConversationInclude
type Conversation = Prisma.ConversationGetPayload<{ include: typeof include }>
type Tx = Prisma.TransactionClient
export type ConversationActor = { id: string; ctx?: unknown; emailVerified?: boolean }

@Injectable()
export class ConversationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly matrix?: ChatMatrixService,
  ) {}

  capabilities() {
    return {
      enabled: this.config.get('CONVERSATIONS_ENABLED') === 'true',
      messagingEnabled: this.config.get('CONVERSATIONS_ENABLED') === 'true' && this.config.get('CHAT_TEXT_ENABLED') === 'true',
      callsEnabled: false,
    }
  }
  private guard(actor: ConversationActor) {
    if (!this.capabilities().enabled) throw new NotFoundException()
    if (actor.ctx)
      throw new ForbiddenException(
        'Conversas disponíveis apenas na identidade pessoal nesta etapa.',
      )
    if (!actor.emailVerified)
      throw new ForbiddenException('Confirme seu e-mail para acessar conversas.')
  }
  private async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.$transaction(work, { isolationLevel: 'Serializable' })
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code)
        )
          throw error
        if (attempt === 2)
          throw new ServiceUnavailableException('Operação concorrente. Tente novamente.')
      }
    }
    throw new ServiceUnavailableException()
  }
  private async load(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id} FOR UPDATE`
    const conversation = await tx.conversation.findUnique({ where: { id }, include })
    if (!conversation) throw new NotFoundException()
    return conversation
  }
  private member(c: Conversation, userId: string, pending = false) {
    const m = c.members.find(
      (m) => m.userId === userId && (m.state === 'ACTIVE' || (pending && m.state === 'INVITED')),
    )
    if (!m) throw new NotFoundException()
    return m
  }
  private owner(c: Conversation) {
    if (c.kind !== 'GROUP') return undefined
    const active = c.members.filter((m) => m.state === 'ACTIVE')
    return (
      active.find((m) => m.userId === c.ownerId)?.userId ??
      active.find((m) => m.role === 'ADMIN')?.userId ??
      active[0]?.userId
    )
  }
  private admin(c: Conversation, userId: string, ownerOnly = false) {
    const m = this.member(c, userId)
    if (c.kind !== 'GROUP' || (this.owner(c) !== userId && (ownerOnly || m.role !== 'ADMIN')))
      throw new ForbiddenException()
  }
  private open(c: Conversation) {
    if (c.archivedAt) throw new ConflictException('Conversa encerrada.')
  }
  private async targets(tx: Tx, actorId: string, ids: string[]) {
    if (ids.includes(actorId)) throw new BadRequestException('Selecione outras pessoas.')
    const users = await tx.user.count({
      where: { id: { in: ids }, banned: false, emailVerified: true },
    })
    if (users !== ids.length)
      throw new BadRequestException('Um ou mais participantes não estão disponíveis.')
    const blocked = await tx.conversationBlock.count({
      where: {
        OR: [
          { blockerId: actorId, blockedId: { in: ids } },
          { blockedId: actorId, blockerId: { in: ids } },
        ],
      },
    })
    if (blocked) throw new ForbiddenException('Não é possível iniciar esta interação.')
  }
  private view(c: Conversation, userId: string) {
    const me = this.member(c, userId, true)
    const ownerId = this.owner(c)
    const rank = (member: Conversation['members'][number]) =>
      (member.state === 'INVITED' ? 10 : 0) + (member.userId === ownerId ? 0 : member.role === 'ADMIN' ? 1 : 2)
    const base = {
      id: c.id,
      kind: c.kind,
      title: c.title,
      revision: c.revision,
      archivedAt: c.archivedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      myState: me.state,
      myRole: ownerId === userId ? 'OWNER' : me.role,
      invitedBy: c.members.find((m) => m.userId === me.invitedById)?.user ?? null,
      memberCount: c.members.filter((m) => m.state === 'ACTIVE').length,
      // Só horário, autoria e contagem: o servidor nunca conhece o texto.
      // Convites pendentes não veem nada da atividade da conversa.
      lastMessage:
        me.state === 'ACTIVE' && c.lastEventId && c.lastEventAt
          ? {
              eventId: c.lastEventId,
              at: c.lastEventAt,
              fromMe: c.lastSenderId === userId,
            }
          : null,
      unreadCount: me.state === 'ACTIVE' ? me.unreadCount : 0,
    }
    // Pending group invitations never expose the participant roster.
    return {
      ...base,
      members:
        me.state === 'INVITED' && c.kind === 'GROUP'
          ? []
          : c.members
              .filter((m) => ['ACTIVE', 'INVITED'].includes(m.state))
              .sort((a, b) => rank(a) - rank(b) || a.user.name.localeCompare(b.user.name, 'pt-BR') || a.userId.localeCompare(b.userId))
              .map((m) => ({
                user: m.user,
                state: m.state,
                role: ownerId === m.userId ? 'OWNER' : m.role,
              })),
    }
  }
  private async changed(tx: Tx, c: Conversation, extra: string[] = []) {
    const updated = await tx.conversation.update({
      where: { id: c.id },
      data: { revision: { increment: 1 } },
      include,
    })
    await this.enqueue(tx, updated, extra)
    return updated
  }
  private async enqueue(tx: Tx, c: Conversation, extra: string[] = []) {
    const recipients = [
      ...new Set([
        ...c.members.filter((m) => ['ACTIVE', 'INVITED'].includes(m.state)).map((m) => m.userId),
        ...extra,
      ]),
    ]
    await tx.conversationOutbox.createMany({
      data: recipients.map((recipientUserId) => ({
        conversationId: c.id,
        revision: c.revision,
        recipientUserId,
      })),
      skipDuplicates: true,
    })
  }
  async list(actor: ConversationActor, query: ConversationListDto) {
    this.guard(actor)
    const where: Prisma.ConversationWhereInput = {
      members: {
        some: { userId: actor.id, state: query.folder === 'requests' ? 'INVITED' : 'ACTIVE' },
      },
    }
    const [total, rows] = await this.db.$transaction(
      [
        this.db.conversation.count({ where }),
        this.db.conversation.findMany({
          where,
          include,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    )
    return {
      items: rows.map((c) => this.view(c, actor.id)),
      total,
      page: query.page,
      limit: query.limit,
    }
  }
  async get(actor: ConversationActor, id: string) {
    this.guard(actor)
    const c = await this.db.conversation.findUnique({ where: { id }, include })
    if (!c) throw new NotFoundException()
    this.member(c, actor.id)
    return this.view(c, actor.id)
  }
  async direct(actor: ConversationActor, targetUserId: string) {
    this.guard(actor)
    return this.transaction(async (tx) => {
      await this.targets(tx, actor.id, [targetUserId])
      const directKey = [actor.id, targetUserId].sort().join(':')
      const existing = await tx.conversation.findUnique({ where: { directKey }, include })
      if (existing) {
        // Only the person who declined may explicitly reopen this direct conversation.
        const declined = existing.members.find(
          (m) => m.userId === actor.id && m.state === 'DECLINED',
        )
        if (
          declined &&
          existing.members.some((m) => m.userId === targetUserId && m.state === 'ACTIVE')
        ) {
          await tx.conversationMember.update({
            where: { id: declined.id },
            data: { state: 'ACTIVE', joinedAt: new Date() },
          })
          return this.view(await this.changed(tx, existing), actor.id)
        }
        this.member(existing, actor.id, true)
        return this.view(existing, actor.id)
      }
      const c = await tx.conversation.create({
        data: {
          kind: 'DIRECT',
          directKey,
          createdById: actor.id,
          members: {
            create: [
              { userId: actor.id, state: 'ACTIVE', joinedAt: new Date() },
              { userId: targetUserId, invitedById: actor.id, state: 'INVITED' },
            ],
          },
        },
        include,
      })
      await this.enqueue(tx, c)
      return this.view(c, actor.id)
    })
  }
  async group(actor: ConversationActor, input: GroupConversationDto) {
    this.guard(actor)
    const requestHash = createHash('sha256')
      .update(JSON.stringify([input.title, [...input.memberIds].sort()]))
      .digest('hex')
    return this.transaction(async (tx) => {
      const previous = await tx.conversation.findUnique({
        where: {
          createdById_clientRequestId: {
            createdById: actor.id,
            clientRequestId: input.clientRequestId,
          },
        },
        include,
      })
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ConflictException('Identificador já utilizado com outros dados.')
        return this.view(previous, actor.id)
      }
      await this.targets(tx, actor.id, input.memberIds)
      const c = await tx.conversation.create({
        data: {
          kind: 'GROUP',
          title: input.title,
          clientRequestId: input.clientRequestId,
          requestHash,
          createdById: actor.id,
          ownerId: actor.id,
          members: {
            create: [
              { userId: actor.id, state: 'ACTIVE', role: 'ADMIN', joinedAt: new Date() },
              ...input.memberIds.map((userId) => ({ userId, invitedById: actor.id })),
            ],
          },
        },
        include,
      })
      await this.enqueue(tx, c)
      return this.view(c, actor.id)
    })
  }
  async mutate(
    actor: ConversationActor,
    id: string,
    action: 'respond' | 'invite' | 'role' | 'remove' | 'leave' | 'transfer' | 'archive',
    input: {
      accept?: boolean
      memberIds?: string[]
      userId?: string
      role?: 'ADMIN' | 'MEMBER'
    } = {},
  ) {
    this.guard(actor)
    let syncTransport: { kind: 'join' | 'kick'; roomId: string; userId: string } | null = null
    const result = await this.transaction(async (tx) => {
      const c = await this.load(tx, id)
      const me = this.member(c, actor.id, action === 'respond')
      this.open(c)
      const updateMember = (userId: string, data: Prisma.ConversationMemberUpdateInput) =>
        tx.conversationMember.update({
          where: { conversationId_userId: { conversationId: id, userId } },
          data,
        })
      if (action === 'respond') {
        if (me.state !== 'INVITED') throw new ConflictException('Solicitação já respondida.')
        if (input.accept) {
          const inviter = c.members.find((m) => m.userId === me.invitedById && m.state === 'ACTIVE')
          if (!inviter || (c.kind === 'GROUP' && !this.owner(c)))
            throw new ConflictException('Convite indisponível.')
          await this.targets(tx, actor.id, [inviter.userId])
        }
        await updateMember(actor.id, {
          state: input.accept ? 'ACTIVE' : 'DECLINED',
          joinedAt: input.accept ? new Date() : null,
        })
      } else if (action === 'invite') {
        this.admin(c, actor.id)
        const ids = input.memberIds!
        await this.targets(tx, actor.id, ids)
        if (
          ids.some((userId) =>
            c.members.some(
              (m) => m.userId === userId && ['ACTIVE', 'INVITED', 'DECLINED'].includes(m.state),
            ),
          )
        )
          throw new ConflictException('Participante já convidado ou convite recusado.')
        if (
          c.members.filter((m) => ['ACTIVE', 'INVITED'].includes(m.state)).length + ids.length >
          100
        )
          throw new ConflictException('Limite de 100 participantes.')
        for (const userId of ids)
          await tx.conversationMember.upsert({
            where: { conversationId_userId: { conversationId: id, userId } },
            create: { conversationId: id, userId, invitedById: actor.id },
            update: { state: 'INVITED', role: 'MEMBER', invitedById: actor.id, joinedAt: null },
          })
      } else if (action === 'leave') {
        if (c.kind !== 'GROUP') throw new BadRequestException()
        if (this.owner(c) === actor.id)
          throw new ConflictException('Transfira a administração antes de sair.')
        await updateMember(actor.id, { state: 'LEFT' })
      } else if (action === 'archive') {
        this.admin(c, actor.id, true)
        await tx.conversation.update({ where: { id }, data: { archivedAt: new Date() } })
        await tx.conversationMember.updateMany({
          where: { conversationId: id, state: 'INVITED' },
          data: { state: 'REMOVED' },
        })
      } else {
        this.admin(c, actor.id, action !== 'remove')
        const target = this.member(c, input.userId!, action === 'remove')
        if (target.userId === actor.id)
          throw new BadRequestException('Use a ação de sair ou selecione outra pessoa.')
        if (action === 'transfer') {
          await tx.conversation.update({ where: { id }, data: { ownerId: target.userId } })
          await updateMember(target.userId, { role: 'ADMIN' })
        } else {
          if (
            this.owner(c) === target.userId ||
            (this.owner(c) !== actor.id && target.role === 'ADMIN')
          )
            throw new ForbiddenException()
          await updateMember(
            target.userId,
            action === 'remove' ? { state: 'REMOVED' } : { role: input.role },
          )
        }
      }
      const updated = await this.changed(
        tx,
        c,
        c.members.filter((m) => ['ACTIVE', 'INVITED'].includes(m.state)).map((m) => m.userId),
      )
      if (c.matrixRoomId) {
        if (action === 'leave')
          syncTransport = { kind: 'kick', roomId: c.matrixRoomId, userId: actor.id }
        else if (action === 'remove')
          syncTransport = { kind: 'kick', roomId: c.matrixRoomId, userId: input.userId! }
        else if (action === 'respond' && input.accept)
          syncTransport = { kind: 'join', roomId: c.matrixRoomId, userId: actor.id }
      }
      return { id, revision: updated.revision }
    })
    if (syncTransport && this.matrix?.enabled()) {
      const op = syncTransport as { kind: 'join' | 'kick'; roomId: string; userId: string }
      try {
        if (op.kind === 'kick') await this.matrix.kick(op.roomId, op.userId)
        else await this.matrix.join(op.roomId, op.userId)
      } catch {
        /* O banco do Votz é a autoridade; o transporte sincroniza na próxima abertura. */
      }
    }
    return result
  }
  async blocks(actor: ConversationActor, query: ConversationPaginationDto) {
    this.guard(actor)
    const where = { blockerId: actor.id }
    const [total, items] = await this.db.$transaction(
      [
        this.db.conversationBlock.count({ where }),
        this.db.conversationBlock.findMany({
          where,
          select: { blockedId: true, createdAt: true, blocked: { select: publicUser } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    )
    return { items, total, page: query.page, limit: query.limit }
  }
  async contacts(actor: ConversationActor, query: string) {
    this.guard(actor)
    return this.db.user.findMany({
      where: {
        id: { not: actor.id },
        banned: false,
        emailVerified: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { username: { contains: query.replace(/^@/, ''), mode: 'insensitive' } },
        ],
        conversationBlocksReceived: { none: { blockerId: actor.id } },
        conversationBlocksSent: { none: { blockedId: actor.id } },
      },
      select: publicUser,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 20,
    })
  }
  async block(actor: ConversationActor, userId: string, remove: boolean) {
    this.guard(actor)
    if (userId === actor.id) throw new BadRequestException()
    return this.db.$transaction(async tx => {
      const directKey = [actor.id, userId].sort().join(':')
      // Sending and blocking use the same row lock, so a completed block
      // cannot race a newly authorized encrypted send for this pair.
      await tx.$queryRaw`SELECT id FROM conversations WHERE direct_key = ${directKey} FOR UPDATE`
    if (remove)
      await tx.conversationBlock.deleteMany({
        where: { blockerId: actor.id, blockedId: userId },
      })
    else {
      if (!(await tx.user.findUnique({ where: { id: userId }, select: { id: true } })))
        throw new NotFoundException()
      await tx.conversationBlock.upsert({
        where: { blockerId_blockedId: { blockerId: actor.id, blockedId: userId } },
        create: { blockerId: actor.id, blockedId: userId },
        update: {},
      })
    }
    return { blocked: !remove }
    }, { timeout: 12000, maxWait: 3000 })
  }
}
