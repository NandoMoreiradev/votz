import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FlagReason, FlagStatus, FlagTargetType, Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { ChatMatrixService } from './chat-matrix.service'
import {
  ConversationListDto,
  ConversationPaginationDto,
  GroupConversationDto,
  ReportConversationDto,
  UpdateConversationSettingsDto,
} from './conversations.dto'
import { DEFAULT_CONVERSATION_SETTINGS, type ConversationSettings } from '@votz/shared-types'

/** Teto diário de solicitações novas para quem ainda não segue de volta (quem já segue: sem limite). */
export const UNFOLLOWED_REQUESTS_PER_DAY = 20
const START_OPTIONS_LIMIT = 100
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
      mutedUntil: me.mutedUntil ? me.mutedUntil.toISOString() : null,
      pinnedAt: me.pinnedAt ? me.pinnedAt.toISOString() : null,
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
  async unreadCount(actor: ConversationActor) {
    this.guard(actor)
    const [agg, requests] = await Promise.all([
      this.db.conversationMember.aggregate({
        where: { userId: actor.id, state: 'ACTIVE' },
        _sum: { unreadCount: true },
      }),
      this.db.conversationMember.count({
        where: { userId: actor.id, state: 'INVITED' },
      }),
    ])
    return { unread: agg._sum.unreadCount ?? 0, requests }
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
      items: rows
        .map((c) => this.view(c, actor.id))
        .sort((a, b) => {
          const ap = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0
          const bp = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0
          return bp - ap
        }),
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
    const base = this.view(c, actor.id)
    // Atualiza "visto por último" do ator em background (best-effort) e aplica reciprocidade em conversas diretas.
    void this.db.chatPrivacy
      ?.upsert({
        where: { userId: actor.id },
        create: { userId: actor.id, lastSeenAt: new Date() },
        update: { lastSeenAt: new Date() },
      })
      .catch(() => {})
    if (c.kind === 'DIRECT' && this.db.chatPrivacy?.findMany) {
      const other = c.members.find((m) => m.userId !== actor.id && m.state === 'ACTIVE')
      if (other) {
        const rows = await this.db.chatPrivacy.findMany({
          where: { userId: { in: [actor.id, other.userId] } },
          select: { userId: true, lastSeenVisibility: true, lastSeenAt: true },
        })
        const mine = rows.find((r) => r.userId === actor.id)
        const theirs = rows.find((r) => r.userId === other.userId)
        const myVis = mine?.lastSeenVisibility ?? DEFAULT_CONVERSATION_SETTINGS.lastSeenVisibility
        const peerVis = theirs?.lastSeenVisibility ?? DEFAULT_CONVERSATION_SETTINGS.lastSeenVisibility
        const allowed = myVis !== 'NOBODY' && peerVis !== 'NOBODY'
        return {
          ...base,
          peerLastSeenAt: allowed && theirs?.lastSeenAt ? theirs.lastSeenAt.toISOString() : null,
        }
      }
    }
    return { ...base, peerLastSeenAt: null }
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
      const targetPrivacy = await tx.chatPrivacy?.findUnique({
        where: { userId: targetUserId },
        select: { directRequestPolicy: true },
      })
      if (targetPrivacy?.directRequestPolicy === 'NOBODY')
        throw new ForbiddenException(
          'Esta pessoa não está aceitando novas solicitações de conversa.',
        )
      // A pessoa que recebe segue quem está chamando? (decide "só quem eu sigo" e o limite diário)
      const targetFollowsMe =
        (await tx.userFollow.count({
          where: { followerId: targetUserId, followingId: actor.id },
        })) > 0
      if (targetPrivacy?.directRequestPolicy === 'FOLLOWING' && !targetFollowsMe)
        throw new ForbiddenException('Esta pessoa só recebe solicitações de quem ela segue.')
      if (!targetFollowsMe) await this.enforceUnfollowedRequestLimit(tx, actor.id)
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
  /**
   * Sem limite diário para quem chama quem já o segue. Para quem NÃO é seguido pelo destinatário,
   * há um teto de solicitações novas por dia (decisão do dono, 20/11/2026), contra spam.
   */
  private async enforceUnfollowedRequestLimit(tx: Tx, actorId: string) {
    const since = new Date(Date.now() - 24 * 3_600_000)
    const recent = await tx.conversation.findMany({
      where: { kind: 'DIRECT', createdById: actorId, createdAt: { gte: since } },
      select: { members: { where: { userId: { not: actorId } }, select: { userId: true } } },
    })
    const targets = recent.flatMap((c) => c.members.map((m) => m.userId))
    if (targets.length < UNFOLLOWED_REQUESTS_PER_DAY) return
    const followers = await tx.userFollow.count({
      where: { followerId: { in: targets }, followingId: actorId },
    })
    if (targets.length - followers >= UNFOLLOWED_REQUESTS_PER_DAY)
      throw new HttpException(
        'Você já chamou muita gente que ainda não te segue hoje. Tente de novo amanhã.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
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
      await this.enforceGroupInvitePolicies(tx, actor.id, input.memberIds)
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
        await this.enforceGroupInvitePolicies(tx, actor.id, ids)
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
  /**
   * Primeira tela de "Nova conversa": quem eu sigo, depois quem me segue (sem repetir),
   * e as páginas que sigo (político, entidade, empresa). Páginas abrem a conversa dentro do perfil.
   */
  async startOptions(actor: ConversationActor) {
    this.guard(actor)
    const visible = {
      banned: false,
      emailVerified: true,
      conversationBlocksReceived: { none: { blockerId: actor.id } },
      conversationBlocksSent: { none: { blockedId: actor.id } },
    } as const
    const take = START_OPTIONS_LIMIT
    const [following, followers, politicians, entities, companies] = await Promise.all([
      this.db.userFollow.findMany({
        where: { followerId: actor.id, following: visible },
        select: { following: { select: publicUser } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.db.userFollow.findMany({
        where: {
          followingId: actor.id,
          follower: { ...visible, followerUsers: { none: { followerId: actor.id } } },
        },
        select: { follower: { select: publicUser } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.db.userPoliticianFollower.findMany({
        where: { userId: actor.id },
        select: { politician: { select: { id: true, name: true, username: true, avatarUrl: true } } },
        take,
      }),
      this.db.userEntityFollower.findMany({
        where: { userId: actor.id },
        select: { entity: { select: { id: true, legalName: true, username: true, logoUrl: true } } },
        take,
      }),
      this.db.userCompanyFollower.findMany({
        where: { userId: actor.id },
        select: { company: { select: { id: true, tradeName: true, username: true, logoUrl: true } } },
        take,
      }),
    ])
    const byName = <T extends { name: string }>(list: T[]) =>
      [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    const pages = byName([
      ...politicians.map(({ politician: p }) => ({
        orgType: 'POLITICIAN' as const, orgId: p.id, name: p.name, username: p.username, avatarUrl: p.avatarUrl,
      })),
      ...entities.map(({ entity: e }) => ({
        orgType: 'ENTITY' as const, orgId: e.id, name: e.legalName, username: e.username, avatarUrl: e.logoUrl,
      })),
      ...companies.map(({ company: c }) => ({
        orgType: 'COMPANY' as const, orgId: c.id, name: c.tradeName, username: c.username, avatarUrl: c.logoUrl,
      })),
    ])
    return {
      following: byName(following.map((f) => f.following)),
      followers: byName(followers.map((f) => f.follower)),
      pages,
    }
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
  async mute(
    actor: ConversationActor,
    id: string,
    duration: '8h' | '1w' | 'forever' | 'off',
  ) {
    this.guard(actor)
    const now = Date.now()
    const mutedUntil =
      duration === 'off'
        ? null
        : duration === '8h'
          ? new Date(now + 8 * 60 * 60 * 1000)
          : duration === '1w'
            ? new Date(now + 7 * 24 * 60 * 60 * 1000)
            : new Date('2099-12-31T23:59:59.000Z')
    const updated = await this.db.conversationMember.updateMany({
      where: { conversationId: id, userId: actor.id, state: 'ACTIVE' },
      data: { mutedUntil },
    })
    if (!updated.count) throw new NotFoundException()
    return {
      conversationId: id,
      mutedUntil: mutedUntil ? mutedUntil.toISOString() : null,
    }
  }
  async pin(actor: ConversationActor, id: string, pinned: boolean) {
    this.guard(actor)
    const pinnedAt = pinned ? new Date() : null
    const updated = await this.db.conversationMember.updateMany({
      where: { conversationId: id, userId: actor.id, state: 'ACTIVE' },
      data: { pinnedAt },
    })
    if (!updated.count) throw new NotFoundException()
    return {
      conversationId: id,
      pinnedAt: pinnedAt ? pinnedAt.toISOString() : null,
    }
  }
  async report(
    actor: ConversationActor,
    id: string,
    input: ReportConversationDto,
  ) {
    this.guard(actor)
    const member = await this.db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: actor.id } },
      select: { state: true },
    })
    if (!member || !['ACTIVE', 'INVITED'].includes(member.state))
      throw new NotFoundException()
    const flag = await this.db.contentFlag.upsert({
      where: {
        reporterId_targetType_targetId: {
          reporterId: actor.id,
          targetType: FlagTargetType.CONVERSATION,
          targetId: id,
        },
      },
      create: {
        reporterId: actor.id,
        targetType: FlagTargetType.CONVERSATION,
        targetId: id,
        reason: input.reason as FlagReason,
        details: input.details || null,
        status: FlagStatus.OPEN,
      },
      update: {
        reason: input.reason as FlagReason,
        details: input.details || null,
        status: FlagStatus.OPEN,
      },
      select: { id: true },
    })
    return { reported: true, flagId: flag.id }
  }
  private mapSettings(row: Partial<ConversationSettings> | null | undefined): ConversationSettings {
    return {
      readReceiptsEnabled: row?.readReceiptsEnabled ?? DEFAULT_CONVERSATION_SETTINGS.readReceiptsEnabled,
      lastSeenVisibility: (row?.lastSeenVisibility as ConversationSettings['lastSeenVisibility']) ?? DEFAULT_CONVERSATION_SETTINGS.lastSeenVisibility,
      groupInvitePolicy: (row?.groupInvitePolicy as ConversationSettings['groupInvitePolicy']) ?? DEFAULT_CONVERSATION_SETTINGS.groupInvitePolicy,
      directRequestPolicy: (row?.directRequestPolicy as ConversationSettings['directRequestPolicy']) ?? DEFAULT_CONVERSATION_SETTINGS.directRequestPolicy,
      notifySound: row?.notifySound ?? DEFAULT_CONVERSATION_SETTINGS.notifySound,
      notifyVibration: row?.notifyVibration ?? DEFAULT_CONVERSATION_SETTINGS.notifyVibration,
      notifyPreview: row?.notifyPreview ?? DEFAULT_CONVERSATION_SETTINGS.notifyPreview,
      securityAlertsEnabled: row?.securityAlertsEnabled ?? DEFAULT_CONVERSATION_SETTINGS.securityAlertsEnabled,
      keyBackupEnabled: row?.keyBackupEnabled ?? DEFAULT_CONVERSATION_SETTINGS.keyBackupEnabled,
      mediaAutoDownload: (row?.mediaAutoDownload as ConversationSettings['mediaAutoDownload']) ?? DEFAULT_CONVERSATION_SETTINGS.mediaAutoDownload,
      mediaUploadQuality: (row?.mediaUploadQuality as ConversationSettings['mediaUploadQuality']) ?? DEFAULT_CONVERSATION_SETTINGS.mediaUploadQuality,
      fontScale: (row?.fontScale as ConversationSettings['fontScale']) ?? DEFAULT_CONVERSATION_SETTINGS.fontScale,
      wallpaper: (row?.wallpaper as ConversationSettings['wallpaper']) ?? DEFAULT_CONVERSATION_SETTINGS.wallpaper,
    }
  }
  private async enforceGroupInvitePolicies(tx: Tx, actorId: string, memberIds: string[]) {
    if (!memberIds.length || !tx.chatPrivacy?.findMany) return
    const rows = await tx.chatPrivacy.findMany({
      where: { userId: { in: memberIds } },
      select: { userId: true, groupInvitePolicy: true },
    })
    if (rows.some((r) => r.groupInvitePolicy === 'NOBODY'))
      throw new ForbiddenException('Uma das pessoas escolhidas não aceita convites para grupos.')
    const contactsOnly = rows
      .filter((r) => r.groupInvitePolicy === 'CONTACTS')
      .map((r) => r.userId)
    if (!contactsOnly.length) return
    const shared = await tx.conversation.findMany({
      where: {
        archivedAt: null,
        AND: [
          { members: { some: { userId: actorId, state: 'ACTIVE' } } },
          { members: { some: { userId: { in: contactsOnly }, state: 'ACTIVE' } } },
        ],
      },
      select: { members: { select: { userId: true, state: true } } },
    })
    const known = new Set<string>()
    for (const conv of shared) {
      for (const m of conv.members) {
        if (m.state === 'ACTIVE' && m.userId !== actorId) known.add(m.userId)
      }
    }
    if (contactsOnly.some((id) => !known.has(id)))
      throw new ForbiddenException('Uma das pessoas escolhidas aceita convites apenas de contatos.')
  }
  async getSettings(actor: ConversationActor): Promise<ConversationSettings> {
    this.guard(actor)
    const row = await this.db.chatPrivacy.findUnique({ where: { userId: actor.id } })
    return this.mapSettings(row as Partial<ConversationSettings> | null)
  }
  async updateSettings(
    actor: ConversationActor,
    input: UpdateConversationSettingsDto,
  ): Promise<ConversationSettings> {
    this.guard(actor)
    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
      // null chega como "ausente" na validação, mas as colunas não aceitam nulo: ignora.
      if (value !== undefined && value !== null) data[key] = value
    }
    return this.db.$transaction(async (tx) => {
      const row = await tx.chatPrivacy.upsert({
        where: { userId: actor.id },
        create: { userId: actor.id, ...data },
        update: data,
      })
      if (input.readReceiptsEnabled === false) {
        await tx.chatReceipt.updateMany({
          where: { recipientUserId: actor.id, readAt: { not: null } },
          data: { readAt: null },
        })
      }
      return this.mapSettings(row as Partial<ConversationSettings>)
    })
  }
}
