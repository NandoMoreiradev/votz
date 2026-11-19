import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectQueue } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'
import type { Queue } from 'bullmq'
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { compare } from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'
import {
  decryptWithKey,
  encryptWithKey,
  parseHexKey,
} from '../crypto/crypto.service'
import { ConversationActor } from './conversations.service'
import { ChatMatrixService } from './chat-matrix.service'
import { NotificationsGateway } from '../notifications/notifications.gateway'
import { StorageService } from '../storage/storage.service'
import { CHAT_PUSH_QUEUE, type ChatPushJobData } from './chat-push.processor'
import {
  ChatReceiptDto,
  EnrollChatDeviceDto,
  SendChatMessageDto,
} from './chat.dto'
import { Prisma } from '@prisma/client'

type Json = Record<string, any>
type DeviceHeaders = { id?: string; secret?: string }
export const MAX_CHAT_DEVICES = 5
export const MAX_PENDING_CHAT_LINKS = 3
export const CHAT_LINK_TTL_MS = 10 * 60 * 1000
/** HTTP 423: o aparelho existe, mas foi desconectado. Não confundir com 401 (sessão) nem 410 (pedido expirado). */
export const CHAT_DEVICE_DISCONNECTED = 423
/** Retenção de anexos cifrados na nuvem (decisão de produto: 90 dias). */
export const CHAT_MEDIA_RETENTION_DAYS = 90
export const CHAT_MEDIA_MAX_BYTES = 50 * 1024 * 1024
@Injectable()
export class ChatService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly matrix: ChatMatrixService,
    private readonly events: NotificationsGateway,
    @Optional() private readonly storage?: StorageService,
    @Optional()
    @InjectQueue(CHAT_PUSH_QUEUE)
    private readonly pushQueue?: Queue<ChatPushJobData>,
  ) {}
  private guard(actor: ConversationActor) {
    if (!this.matrix.enabled()) throw new NotFoundException()
    if (actor.ctx || !actor.emailVerified)
      throw new ForbiddenException(
        'Use sua identidade pessoal e confirme seu e-mail.',
      )
  }
  private key() {
    return parseHexKey(
      this.config.getOrThrow<string>('CHAT_TOKEN_ENCRYPTION_KEY'),
    )
  }
  private hash(secret: string) {
    return createHash('sha256').update(secret).digest('hex')
  }
  private same(left: string, right: string) {
    return (
      left.length === right.length &&
      timingSafeEqual(Buffer.from(left), Buffer.from(right))
    )
  }
  private async device(actor: ConversationActor, headers: DeviceHeaders) {
    this.guard(actor)
    if (!headers.id || !headers.secret || headers.secret.length > 128)
      throw new UnauthorizedException(
        'Desbloqueie suas conversas neste dispositivo.',
      )
    const device = await this.db.chatDevice.findUnique({
      where: { id: headers.id },
    })
    if (
      !device ||
      device.userId !== actor.id ||
      device.revokedAt ||
      !this.same(device.secretHash, this.hash(headers.secret))
    )
      throw new UnauthorizedException(
        'Dispositivo de conversas não autorizado.',
      )
    return { ...device, token: decryptWithKey(device.matrixToken, this.key()) }
  }
  private ready(actor: ConversationActor, deviceId: string) {
    return {
      status: 'ready' as const,
      deviceId,
      matrixUserId: this.matrix.userId(actor.id),
      protocol: 'matrix-olm-megolm-v1',
      singleDevicePilot: false,
      maxDevices: MAX_CHAT_DEVICES,
    }
  }
  private waiting(link: { code: string; expiresAt: Date }) {
    return {
      status: 'pending_approval' as const,
      code: link.code,
      expiresAt: link.expiresAt.toISOString(),
    }
  }
  private async activate(
    tx: Prisma.TransactionClient,
    actor: ConversationActor,
    input: EnrollChatDeviceDto,
  ) {
    const session = await this.matrix.login(
      this.matrix.userId(actor.id).split(':')[0].slice(1),
      input.id,
    )
    if (
      session.user_id !== this.matrix.userId(actor.id) ||
      session.device_id !== input.id ||
      typeof session.access_token !== 'string'
    )
      throw new ForbiddenException()
    await tx.chatDevice.create({
      data: {
        id: input.id,
        userId: actor.id,
        platform: input.platform,
        label: input.label?.trim() || null,
        secretHash: this.hash(input.secret),
        matrixToken: encryptWithKey(session.access_token, this.key()),
      },
    })
  }
  /**
   * O primeiro aparelho da conta ativa direto. Qualquer aparelho adicional vira
   * um pedido de vínculo que só um aparelho já ativo pode aprovar; chaves nunca
   * são entregues a um aparelho novo apenas porque o login da conta funcionou.
   */
  async enroll(actor: ConversationActor, input: EnrollChatDeviceDto) {
    this.guard(actor)
    await this.matrix.admin()
    await this.matrix.provision(actor.id)
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`
        const secretHash = this.hash(input.secret)
        const known = await tx.chatDevice.findUnique({
          where: { id: input.id },
        })
        if (known) {
          if (
            known.userId !== actor.id ||
            !this.same(known.secretHash, secretHash)
          )
            throw new ConflictException(
              'Identificador de dispositivo indisponível.',
            )
          // Este aparelho foi desconectado: o app apaga as credenciais locais e
          // começa de novo, sem a pessoa precisar entender o que houve.
          if (known.revokedAt)
            throw new HttpException(
              'Este aparelho foi desconectado.',
              CHAT_DEVICE_DISCONNECTED,
            )
          return this.ready(actor, known.id)
        }
        const active = await tx.chatDevice.count({
          where: { userId: actor.id, revokedAt: null },
        })
        if (active === 0) {
          await tx.chatDeviceLink.deleteMany({ where: { userId: actor.id } })
          await this.activate(tx, actor, input)
          return this.ready(actor, input.id)
        }
        if (active >= MAX_CHAT_DEVICES)
          throw new ConflictException(
            `Sua conta já tem ${MAX_CHAT_DEVICES} aparelhos conectados. Desconecte um deles para adicionar outro.`,
          )
        const now = new Date()
        const link = await tx.chatDeviceLink.findUnique({
          where: { id: input.id },
        })
        if (!link) {
          await tx.chatDeviceLink.deleteMany({
            where: { userId: actor.id, expiresAt: { lte: now } },
          })
          const pending = await tx.chatDeviceLink.count({
            where: { userId: actor.id, decidedAt: null },
          })
          if (pending >= MAX_PENDING_CHAT_LINKS)
            throw new HttpException(
              'Há pedidos de conexão demais aguardando resposta. Responda ou aguarde expirar.',
              429,
            )
          return this.waiting(
            await tx.chatDeviceLink.create({
              data: {
                id: input.id,
                userId: actor.id,
                platform: input.platform,
                label: input.label?.trim() || null,
                secretHash,
                code: String(randomInt(0, 1_000_000)).padStart(6, '0'),
                expiresAt: new Date(now.getTime() + CHAT_LINK_TTL_MS),
              },
            }),
          )
        }
        if (link.userId !== actor.id || !this.same(link.secretHash, secretHash))
          throw new ConflictException(
            'Identificador de dispositivo indisponível.',
          )
        if (link.expiresAt <= now)
          throw new GoneException('O pedido expirou. Peça a conexão novamente.')
        if (link.approved === false)
          throw new ForbiddenException(
            'A conexão deste aparelho foi recusada.',
          )
        if (link.approved !== true) return this.waiting(link)
        await tx.chatDeviceLink.delete({ where: { id: link.id } })
        await this.activate(tx, actor, input)
        return this.ready(actor, input.id)
      },
      { timeout: 15000 },
    )
  }
  /**
   * Quem perdeu o acesso a todos os aparelhos antigos recomeça do zero:
   * confirma a senha da conta, todos os aparelhos são desconectados e o
   * próximo vira o primeiro. Mensagens antigas não podem ser lidas de novo
   * (as chaves estavam só nos aparelhos antigos).
   */
  async reset(actor: ConversationActor, password: string) {
    this.guard(actor)
    const user = await this.db.user.findUnique({
      where: { id: actor.id },
      select: { password: true, mfaEnabled: true },
    })
    if (!user?.password)
      throw new ForbiddenException(
        'Para redefinir, sua conta precisa ter uma senha do Votz.',
      )
    if (user.mfaEnabled)
      throw new ForbiddenException(
        'Sua conta usa verificação em duas etapas. Por segurança, a redefinição por aqui ainda não está disponível para ela.',
      )
    if (!(await compare(password, user.password)))
      throw new ForbiddenException('Senha incorreta.')
    const revoked = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`
      const active = await tx.chatDevice.findMany({
        where: { userId: actor.id, revokedAt: null },
        select: { id: true },
      })
      await tx.chatDevice.updateMany({
        where: { userId: actor.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          pushToken: null,
          pushTokenUpdatedAt: null,
        },
      })
      await tx.chatDeviceLink.deleteMany({ where: { userId: actor.id } })
      return active
    })
    for (const { id } of revoked)
      try {
        await this.matrix.request(
          `/_synapse/admin/v2/users/${encodeURIComponent(this.matrix.userId(actor.id))}/devices/${encodeURIComponent(id)}`,
          'DELETE',
          undefined,
          await this.matrix.admin(),
        )
      } catch {
        /* O banco é a autoridade; o transporte só perde o aparelho depois. */
      }
    return { reset: true, disconnected: revoked.length }
  }
  async devices(actor: ConversationActor, headers: DeviceHeaders) {
    const current = await this.device(actor, headers)
    const [devices, links] = await Promise.all([
      this.db.chatDevice.findMany({
        where: { userId: actor.id, revokedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, platform: true, label: true, createdAt: true },
      }),
      this.db.chatDeviceLink.findMany({
        where: {
          userId: actor.id,
          decidedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          platform: true,
          label: true,
          code: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
    ])
    return {
      devices: devices.map((row) => ({ ...row, current: row.id === current.id })),
      links,
    }
  }
  async decideLink(
    actor: ConversationActor,
    headers: DeviceHeaders,
    linkId: string,
    approve: boolean,
  ) {
    const device = await this.device(actor, headers)
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`
      const link = await tx.chatDeviceLink.findUnique({ where: { id: linkId } })
      if (!link || link.userId !== actor.id) throw new NotFoundException()
      if (link.decidedAt || link.expiresAt <= new Date())
        throw new ConflictException('Este pedido já foi respondido ou expirou.')
      await tx.chatDeviceLink.update({
        where: { id: linkId },
        data: {
          approved: approve,
          decidedAt: new Date(),
          decidedByDeviceId: device.id,
        },
      })
      return { approved: approve }
    })
  }
  async revokeDevice(
    actor: ConversationActor,
    headers: DeviceHeaders,
    deviceId: string,
  ) {
    const current = await this.device(actor, headers)
    const result = await this.db.chatDevice.updateMany({
      where: { id: deviceId, userId: actor.id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        pushToken: null,
        pushTokenUpdatedAt: null,
      },
    })
    if (!result.count) throw new NotFoundException()
    try {
      // Remove o aparelho do transporte para que ninguém mais cifre para ele.
      await this.matrix.request(
        `/_synapse/admin/v2/users/${encodeURIComponent(this.matrix.userId(actor.id))}/devices/${encodeURIComponent(deviceId)}`,
        'DELETE',
        undefined,
        await this.matrix.admin(),
      )
    } catch {
      /* O banco é a autoridade: toda rota passa por device() e as consultas de chaves são filtradas. */
    }
    return { revoked: true, self: deviceId === current.id }
  }
  /** Registra ou atualiza o token de push discreto deste aparelho ativo. */
  async registerPushToken(
    actor: ConversationActor,
    headers: DeviceHeaders,
    token: string,
  ) {
    const current = await this.device(actor, headers)
    await this.db.chatDevice.updateMany({
      where: { id: current.id, userId: actor.id, revokedAt: null },
      data: { pushToken: token, pushTokenUpdatedAt: new Date() },
    })
    return { registered: true }
  }
  /** Remove o token de push deste aparelho (ex.: ao sair da conta). */
  async clearPushToken(actor: ConversationActor, headers: DeviceHeaders) {
    const current = await this.device(actor, headers)
    await this.db.chatDevice.updateMany({
      where: { id: current.id, userId: actor.id, revokedAt: null },
      data: { pushToken: null, pushTokenUpdatedAt: null },
    })
    return { registered: false }
  }
  private async conversation(
    actor: ConversationActor,
    id: string,
    write = false,
    client: Prisma.TransactionClient = this.db,
  ) {
    const c = await client.conversation.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, banned: true, emailVerified: true },
            },
          },
        },
      },
    })
    const me = c?.members.find(
      (m) => m.userId === actor.id && m.state === 'ACTIVE',
    )
    if (!c || !me) throw new NotFoundException()
    if (c.archivedAt)
      throw new ConflictException('Esta conversa foi encerrada.')
    if (c.kind === 'DIRECT') {
      if (
        c.members.length !== 2 ||
        c.members.some(
          (m) => m.state !== 'ACTIVE' || m.user.banned || !m.user.emailVerified,
        )
      )
        throw new ConflictException(
          'O envio será liberado após o aceite da conversa individual.',
        )
      const other = c.members.find((m) => m.userId !== actor.id)!
      const blocked = await client.conversationBlock.count({
        where: {
          OR: [
            { blockerId: actor.id, blockedId: other.userId },
            { blockedId: actor.id, blockerId: other.userId },
          ],
        },
      })
      if (write && blocked)
        throw new ForbiddenException('Esta interação está bloqueada.')
      return {
        c,
        kind: 'DIRECT' as const,
        otherId: other.userId,
        otherIds: [other.userId],
        peerMembers: [other],
        canSend: !blocked,
      }
    }
    if (me.user.banned || !me.user.emailVerified)
      throw new ConflictException('Sua conta não pode participar deste grupo.')
    const peerMembers = c.members.filter(
      (m) =>
        m.userId !== actor.id &&
        m.state === 'ACTIVE' &&
        !m.user.banned &&
        m.user.emailVerified,
    )
    const otherIds = peerMembers.map((m) => m.userId)
    const canSend = otherIds.length > 0
    if (write && !canSend)
      throw new ConflictException(
        'Aguarde outra pessoa aceitar o convite do grupo para enviar mensagens.',
      )
    return {
      c,
      kind: 'GROUP' as const,
      otherId: otherIds[0] ?? null,
      otherIds,
      peerMembers,
      canSend,
    }
  }
  async transport(
    actor: ConversationActor,
    headers: DeviceHeaders,
    id: string,
  ) {
    await this.device(actor, headers)
    const before = await this.conversation(actor, id)
    if (before.kind === 'DIRECT' && !before.c.matrixRoomId && !before.canSend)
      throw new ForbiddenException('Esta interação está bloqueada.')
    await this.matrix.admin()
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id} FOR UPDATE`
        const { c, kind, otherIds, peerMembers, canSend } =
          await this.conversation(actor, id, false, tx)
        const roomId =
          c.matrixRoomId ||
          (await this.matrix.room(id, [actor.id, ...otherIds]))
        if (!c.matrixRoomId)
          await tx.conversation.update({
            where: { id },
            data: { matrixRoomId: roomId },
          })
        else if (kind === 'GROUP') await this.matrix.join(roomId, actor.id)
        const rows = await tx.chatDevice.findMany({
          where: { userId: { in: [actor.id, ...otherIds] }, revokedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, userId: true },
        })
        const peers = peerMembers.map((member) => {
          const devices = rows
            .filter((row) => row.userId === member.userId)
            .map((row) => row.id)
          return {
            userId: member.userId,
            name: member.user.name,
            matrixUserId: this.matrix.userId(member.userId),
            // `deviceId` fica por compatibilidade com clientes de um aparelho só.
            deviceId: devices[0] ?? null,
            devices,
          }
        })
        return {
          kind,
          roomId,
          revision: c.revision,
          canSend,
          selfDevices: rows
            .filter((row) => row.userId === actor.id)
            .map((row) => row.id),
          peer: kind === 'DIRECT' ? (peers[0] ?? null) : null,
          peers,
        }
      },
      { timeout: 15000, maxWait: 3000 },
    )
  }
  private async authorizePeer(
    actor: ConversationActor,
    matrixId: string,
    write = false,
  ) {
    if (matrixId === this.matrix.userId(actor.id)) return actor.id
    const prefix = '@votz_'
    const raw =
      matrixId.startsWith(prefix) &&
      matrixId.endsWith(`:${this.matrix.serverName()}`)
        ? matrixId.slice(prefix.length, matrixId.indexOf(':'))
        : ''
    if (!/^[0-9a-f]{32}$/.test(raw)) throw new ForbiddenException()
    const userId = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
    const rows = await this.db.conversation.findMany({
      where: {
        kind: { in: ['DIRECT', 'GROUP'] },
        archivedAt: null,
        AND: [
          { members: { some: { userId: actor.id, state: 'ACTIVE' } } },
          { members: { some: { userId, state: 'ACTIVE' } } },
        ],
      },
      select: { id: true, kind: true },
      take: 10,
    })
    if (!rows.length) throw new ForbiddenException()
    // Se compartilham um grupo ativo, estão autorizados mesmo que exista bloqueio individual.
    const group = rows.find((row) => row.kind === 'GROUP')
    if (group) {
      await this.conversation(actor, group.id, false)
      return userId
    }
    await this.conversation(actor, rows[0].id, write)
    return userId
  }
  private size(body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Buffer.byteLength(JSON.stringify(body)) > 131072
    )
      throw new BadRequestException('Carga de mensagem inválida.')
  }
  async keys(
    actor: ConversationActor,
    headers: DeviceHeaders,
    operation: 'upload' | 'query' | 'claim',
    body: Json,
  ) {
    const device = await this.device(actor, headers)
    this.size(body)
    if (operation === 'upload') {
      if (
        body.device_keys &&
        (body.device_keys.user_id !== this.matrix.userId(actor.id) ||
          body.device_keys.device_id !== device.id)
      )
        throw new ForbiddenException()
      if (
        Object.keys(body).some(
          (key) =>
            !['device_keys', 'one_time_keys', 'fallback_keys'].includes(key),
        )
      )
        throw new BadRequestException()
    } else {
      const targets =
        operation === 'query' ? body.device_keys : body.one_time_keys
      if (
        !targets ||
        typeof targets !== 'object' ||
        Array.isArray(targets) ||
        Object.keys(targets).length > 100
      )
        throw new BadRequestException()
      const owners = new Map<string, string>()
      for (const matrixId of Object.keys(targets))
        owners.set(
          matrixId,
          await this.authorizePeer(actor, matrixId, operation === 'claim'),
        )
      // Só aparelhos ativos do Votz participam do protocolo: aparelhos revogados
      // ou desconhecidos nunca aparecem em consultas nem recebem chaves.
      const active = await this.db.chatDevice.findMany({
        where: { userId: { in: [...owners.values()] }, revokedAt: null },
        select: { id: true, userId: true },
      })
      const allowed = (matrixId: string, deviceId: string) =>
        active.some(
          (row) => row.userId === owners.get(matrixId) && row.id === deviceId,
        )
      if (operation === 'claim') {
        const filtered: Json = {}
        for (const [matrixId, devices] of Object.entries(targets) as [
          string,
          Json,
        ][]) {
          if (!devices || typeof devices !== 'object' || Array.isArray(devices))
            throw new BadRequestException()
          const kept = Object.fromEntries(
            Object.entries(devices).filter(([id]) => allowed(matrixId, id)),
          )
          if (Object.keys(kept).length) filtered[matrixId] = kept
        }
        if (!Object.keys(filtered).length)
          return { one_time_keys: {}, failures: {} }
        body = { ...body, one_time_keys: filtered }
      }
      const result = await this.matrix.request(
        `/_matrix/client/v3/keys/${operation}`,
        'POST',
        body,
        device.token,
      )
      if (operation === 'query' && result.device_keys)
        for (const [matrixId, devices] of Object.entries(
          result.device_keys,
        ) as [string, Json][])
          result.device_keys[matrixId] = Object.fromEntries(
            Object.entries(devices).filter(([id]) => allowed(matrixId, id)),
          )
      return result
    }
    return this.matrix.request(
      `/_matrix/client/v3/keys/${operation}`,
      'POST',
      body,
      device.token,
    )
  }
  async toDevice(
    actor: ConversationActor,
    headers: DeviceHeaders,
    eventType: string,
    txn: string,
    body: Json,
  ) {
    const device = await this.device(actor, headers)
    this.size(body)
    if (
      ![
        'm.room.encrypted',
        'm.room_key.withheld',
        'm.key.verification.request',
        'm.key.verification.ready',
        'm.key.verification.start',
        'm.key.verification.accept',
        'm.key.verification.key',
        'm.key.verification.mac',
        'm.key.verification.done',
        'm.key.verification.cancel',
      ].includes(eventType) ||
      !/^[a-zA-Z0-9._~-]{1,150}$/.test(txn)
    )
      throw new BadRequestException()
    if (
      !body.messages ||
      Object.keys(body).some((key) => key !== 'messages') ||
      Object.keys(body.messages).length > 20
    )
      throw new BadRequestException()
    for (const [matrixUserId, messages] of Object.entries(body.messages) as [
      string,
      Json,
    ][]) {
      const peerId = await this.authorizePeer(actor, matrixUserId, true)
      const rows = await this.db.chatDevice.findMany({
        where: { userId: peerId, revokedAt: null },
        select: { id: true },
      })
      const activeIds = new Set(rows.map((row) => row.id))
      if (
        !messages ||
        typeof messages !== 'object' ||
        Array.isArray(messages) ||
        !Object.keys(messages).length ||
        Object.keys(messages).length > MAX_CHAT_DEVICES ||
        // Nunca curingas ("*"), aparelhos revogados ou o próprio remetente.
        Object.keys(messages).some(
          (id) =>
            !activeIds.has(id) ||
            (peerId === actor.id && id === device.id),
        )
      )
        throw new ForbiddenException()
      for (const content of Object.values(messages) as Json[]) {
      if (!content || typeof content !== 'object' || Array.isArray(content))
        throw new BadRequestException()
      if (eventType === 'm.room.encrypted') {
        if (
          content.algorithm !== 'm.olm.v1.curve25519-aes-sha2' ||
          typeof content.sender_key !== 'string' ||
          !content.ciphertext ||
          typeof content.ciphertext !== 'object' ||
          Array.isArray(content.ciphertext) ||
          Object.keys(content).some(
            (key) =>
              ![
                'algorithm',
                'sender_key',
                'ciphertext',
                'org.matrix.msgid',
              ].includes(key),
          )
        )
          throw new BadRequestException()
        const ciphertexts = Object.values(content.ciphertext) as Json[]
        if (
          !ciphertexts.length ||
          ciphertexts.length > 2 ||
          ciphertexts.some(
            (value) =>
              !value ||
              ![0, 1].includes(value.type) ||
              typeof value.body !== 'string' ||
              Object.keys(value).some((key) => !['type', 'body'].includes(key)),
          )
        )
          throw new BadRequestException()
      } else if (eventType === 'm.room_key.withheld') {
        const fields = [
          'algorithm',
          'code',
          'reason',
          'room_id',
          'session_id',
          'sender_key',
          'from_device',
        ]
        if (
          content.algorithm !== 'm.megolm.v1.aes-sha2' ||
          (content.from_device && content.from_device !== device.id) ||
          ![
            'm.blacklisted',
            'm.unverified',
            'm.unauthorised',
            'm.unavailable',
            'm.no_olm',
          ].includes(content.code) ||
          Object.entries(content).some(
            ([key, value]) =>
              !fields.includes(key) ||
              typeof value !== 'string' ||
              value.length > 512,
          )
        )
          throw new BadRequestException()
      } else {
        const fields = [
          'transaction_id',
          'from_device',
          'methods',
          'timestamp',
          'method',
          'key_agreement_protocols',
          'hashes',
          'message_authentication_codes',
          'short_authentication_string',
          'key_agreement_protocol',
          'hash',
          'message_authentication_code',
          'commitment',
          'key',
          'keys',
          'mac',
          'code',
          'reason',
          'next_method',
        ]
        if (
          Object.keys(content).some((key) => !fields.includes(key)) ||
          (content.from_device && content.from_device !== device.id) ||
          typeof content.transaction_id !== 'string' ||
          content.transaction_id.length > 150
        )
          throw new BadRequestException()
      }
      }
    }
    return this.matrix.request(
      `/_matrix/client/v3/sendToDevice/${encodeURIComponent(eventType)}/${encodeURIComponent(txn)}`,
      'PUT',
      body,
      device.token,
    )
  }
  async sync(actor: ConversationActor, headers: DeviceHeaders, since?: string) {
    const device = await this.device(actor, headers)
    if (since && since.length > 2048) throw new BadRequestException()
    const filter = JSON.stringify({
      presence: { types: [] },
      room: {
        timeline: { types: ['m.room.encrypted'], limit: 30 },
        state: { types: [] },
        ephemeral: { types: ['m.receipt'] },
        account_data: { types: [] },
      },
    })
    const params = new URLSearchParams({
      timeout: '8000',
      set_presence: 'offline',
      filter,
      ...(since ? { since } : {}),
    })
    const data = await this.matrix.request(
      `/_matrix/client/v3/sync?${params}`,
      'GET',
      undefined,
      device.token,
      12000,
    )
    // Never expose rooms based solely on upstream membership; Votz is authoritative.
    const rooms = data.rooms?.join || {}
    const allowed = await this.db.conversation.findMany({
      where: {
        kind: { in: ['DIRECT', 'GROUP'] },
        archivedAt: null,
        matrixRoomId: { in: Object.keys(rooms) },
        members: { some: { userId: actor.id, state: 'ACTIVE' } },
      },
      select: { matrixRoomId: true },
    })
    const ids = new Set(allowed.map((row) => row.matrixRoomId))
    data.rooms = {
      join: Object.fromEntries(
        Object.entries(rooms).filter(([id]) => ids.has(id)),
      ),
    }
    delete data.presence
    delete data.account_data
    const events = []
    for (const event of data.to_device?.events || []) {
      try {
        await this.authorizePeer(actor, event.sender, true)
        events.push(event)
      } catch (error) {
        if (
          !(error instanceof HttpException) ||
          ![403, 404, 409].includes(error.getStatus())
        )
          throw error
      }
    }
    data.to_device = { events }
    for (const key of ['changed', 'left']) {
      const filtered: string[] = []
      for (const userId of data.device_lists?.[key] || []) {
        try {
          await this.authorizePeer(actor, userId)
          filtered.push(userId)
        } catch (error) {
          if (
            !(error instanceof HttpException) ||
            ![403, 404, 409].includes(error.getStatus())
          )
            throw error
        }
      }
      if (data.device_lists) data.device_lists[key] = filtered
    }
    return data
  }
  async history(
    actor: ConversationActor,
    headers: DeviceHeaders,
    id: string,
    from?: string,
  ) {
    const device = await this.device(actor, headers)
    const { c } = await this.conversation(actor, id)
    if (!c.matrixRoomId) return { chunk: [] }
    if (from && from.length > 2048) throw new BadRequestException()
    const params = new URLSearchParams({
      dir: 'b',
      limit: '30',
      filter: JSON.stringify({ types: ['m.room.encrypted'] }),
      ...(from ? { from } : {}),
    })
    return this.matrix.request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(c.matrixRoomId)}/messages?${params}`,
      'GET',
      undefined,
      device.token,
    )
  }
  async send(
    actor: ConversationActor,
    headers: DeviceHeaders,
    id: string,
    txn: string,
    input: SendChatMessageDto,
  ) {
    const device = await this.device(actor, headers)
    const content = input.content as Json
    this.size(content)
    if (
      !/^[a-zA-Z0-9._~-]{1,150}$/.test(txn) ||
      content.algorithm !== 'm.megolm.v1.aes-sha2' ||
      typeof content.ciphertext !== 'string' ||
      content.ciphertext.length > 24000 ||
      (content.device_id && content.device_id !== device.id) ||
      !['session_id', 'sender_key'].every(
        (key) => typeof content[key] === 'string',
      ) ||
      Object.keys(content).some(
        (key) =>
          ![
            'algorithm',
            'ciphertext',
            'device_id',
            'sender_key',
            'session_id',
          ].includes(key),
      )
    )
      throw new BadRequestException(
        'Apenas envelopes cifrados do protocolo são aceitos.',
      )
    let notify: string[] = []
    let pushRecipients: string[] = []
    let pushEventId: string | null = null
    const sent = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id} FOR UPDATE`
        const { c, otherIds } = await this.conversation(actor, id, true, tx)
        if (!c.matrixRoomId || c.revision !== input.revision)
          throw new ConflictException('Atualize a conversa antes de enviar.')
        const result = await this.matrix.request(
          `/_matrix/client/v3/rooms/${encodeURIComponent(c.matrixRoomId)}/send/m.room.encrypted/${encodeURIComponent(txn)}`,
          'PUT',
          content,
          device.token,
          8000,
        )
        // Metadados para a lista de conversas: o servidor não conhece o texto,
        // só quando foi enviado, por quem, e quantas mensagens cada participante
        // ainda não abriu. Repetir a mesma transação não conta duas vezes.
        if (
          typeof result.event_id === 'string' &&
          c.lastEventId !== result.event_id
        ) {
          await tx.conversation.update({
            where: { id },
            data: {
              lastEventId: result.event_id,
              lastEventAt: new Date(),
              lastSenderId: actor.id,
            },
          })
          if (otherIds.length)
            await tx.conversationMember.updateMany({
              where: {
                conversationId: id,
                userId: { in: otherIds },
                state: 'ACTIVE',
              },
              data: { unreadCount: { increment: 1 } },
            })
          notify = [actor.id, ...otherIds]
          const nowMs = Date.now()
          pushRecipients = c.members
            .filter(
              (m) =>
                otherIds.includes(m.userId) &&
                (!m.mutedUntil || m.mutedUntil.getTime() <= nowMs),
            )
            .map((m) => m.userId)
          pushEventId = result.event_id
        }
        return result
      },
      { timeout: 11000, maxWait: 3000 },
    )
    this.invalidate(notify, id)
    if (pushEventId && pushRecipients.length && this.pushQueue) {
      void this.pushQueue
        .add(
          'discrete-push',
          {
            conversationId: id,
            recipientUserIds: pushRecipients,
            eventId: pushEventId,
          },
          {
            jobId: `push:${id}:${pushEventId}`,
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          },
        )
        .catch(() => {
          /* Falha na fila de push nunca reverte uma mensagem já enviada. */
        })
    }
    return sent
  }
  /** Avisa as listas abertas (só id e revisão, nunca conteúdo); falha não afeta o envio. */
  private invalidate(userIds: string[], conversationId: string, revision = 0) {
    for (const userId of userIds)
      try {
        this.events.emitToUser(userId, 'conversation:changed', {
          conversationId,
          revision,
        })
      } catch {
        /* A lista também atualiza sozinha em poucos segundos. */
      }
  }
  /** A pessoa abriu a conversa: zera o contador de não lidas dela. */
  async seen(actor: ConversationActor, headers: DeviceHeaders, id: string) {
    await this.device(actor, headers)
    await this.conversation(actor, id)
    const result = await this.db.conversationMember.updateMany({
      where: {
        conversationId: id,
        userId: actor.id,
        state: 'ACTIVE',
        unreadCount: { gt: 0 },
      },
      data: { unreadCount: 0 },
    })
    // Outros aparelhos da própria conta limpam o contador na hora.
    if (result.count) this.invalidate([actor.id], id)
    return { unreadCount: 0 }
  }
  /** Aviso efêmero de "digitando...": nunca grava no banco, só propaga pelo socket. */
  async typing(actor: ConversationActor, id: string, typing: boolean) {
    this.guard(actor)
    const { c, otherIds } = await this.conversation(actor, id, true)
    const me = c.members.find((m) => m.userId === actor.id)
    const userName = me?.user?.name || 'Alguém'
    for (const userId of otherIds)
      try {
        this.events.emitToUser(userId, 'conversation:typing', {
          conversationId: id,
          userId: actor.id,
          userName,
          typing: Boolean(typing),
        })
      } catch {
        /* Efêmero: falha de socket não afeta a conversa. */
      }
    return { ok: true }
  }
  async privacy(actor: ConversationActor, headers: DeviceHeaders) {
    await this.device(actor, headers)
    return {
      readReceiptsEnabled:
        (await this.db.chatPrivacy.findUnique({ where: { userId: actor.id } }))
          ?.readReceiptsEnabled ?? false,
    }
  }
  async setPrivacy(
    actor: ConversationActor,
    headers: DeviceHeaders,
    enabled: boolean,
  ) {
    await this.device(actor, headers)
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`
      await tx.chatPrivacy.upsert({
        where: { userId: actor.id },
        create: { userId: actor.id, readReceiptsEnabled: enabled },
        update: { readReceiptsEnabled: enabled },
      })
      return { readReceiptsEnabled: enabled }
    })
  }
  async receipts(
    actor: ConversationActor,
    headers: DeviceHeaders,
    id: string,
    eventIds: string[],
  ) {
    await this.device(actor, headers)
    const { kind, otherId, otherIds } = await this.conversation(actor, id)
    if (kind === 'DIRECT')
      return {
        receipts: await this.db.chatReceipt.findMany({
          where: {
            conversationId: id,
            recipientUserId: otherId!,
            eventId: { in: eventIds },
          },
          select: { eventId: true, deliveredAt: true, readAt: true },
        }),
      }
    if (!otherIds.length) return { receipts: [] }
    const rows = await this.db.chatReceipt.findMany({
      where: {
        conversationId: id,
        recipientUserId: { in: otherIds },
        eventId: { in: eventIds },
      },
      select: { eventId: true, deliveredAt: true, readAt: true },
    })
    const byEvent = new Map<
      string,
      {
        deliveredCount: number
        readCount: number
        deliveredAt: Date | null
        readAt: Date | null
      }
    >()
    for (const row of rows) {
      const entry = byEvent.get(row.eventId) ?? {
        deliveredCount: 0,
        readCount: 0,
        deliveredAt: null,
        readAt: null,
      }
      entry.deliveredCount += 1
      if (!entry.deliveredAt || row.deliveredAt > entry.deliveredAt)
        entry.deliveredAt = row.deliveredAt
      if (row.readAt) {
        entry.readCount += 1
        if (!entry.readAt || row.readAt > entry.readAt) entry.readAt = row.readAt
      }
      byEvent.set(row.eventId, entry)
    }
    return {
      receipts: [...byEvent.entries()].map(([eventId, entry]) => ({
        eventId,
        deliveredAt: entry.deliveredAt,
        readAt: entry.readAt,
        deliveredCount: entry.deliveredCount,
        readCount: entry.readCount,
        totalRecipients: otherIds.length,
      })),
    }
  }
  async acknowledge(
    actor: ConversationActor,
    headers: DeviceHeaders,
    id: string,
    input: ChatReceiptDto,
  ) {
    const device = await this.device(actor, headers)
    const { c, kind, otherId } = await this.conversation(actor, id, true)
    if (!c.matrixRoomId) throw new NotFoundException()
    const selfMatrixId = this.matrix.userId(actor.id)
    // Validate each receipt against the actual upstream event. Never trust a
    // client-supplied sender, room, or recipient identity.
    for (let offset = 0; offset < input.eventIds.length; offset += 4) {
      await Promise.all(
        input.eventIds.slice(offset, offset + 4).map(async (eventId) => {
          const event = await this.matrix.request(
            `/_matrix/client/v3/rooms/${encodeURIComponent(c.matrixRoomId!)}/event/${encodeURIComponent(eventId)}`,
            'GET',
            undefined,
            device.token,
            2500,
          )
          const validSender =
            kind === 'DIRECT'
              ? event.sender === this.matrix.userId(otherId!)
              : typeof event.sender === 'string' && event.sender !== selfMatrixId
          if (event.type !== 'm.room.encrypted' || !validSender)
            throw new ForbiddenException(
              'A confirmação deve se referir a uma mensagem recebida nesta conversa.',
            )
        }),
      )
    }
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id} FOR UPDATE`
        await this.conversation(actor, id, true, tx)
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`
        if (
          input.read &&
          !(await tx.chatPrivacy.findUnique({ where: { userId: actor.id } }))
            ?.readReceiptsEnabled
        )
          throw new ForbiddenException(
            'Ative a confirmação de leitura antes de compartilhá-la.',
          )
        for (const eventId of input.eventIds) {
          await tx.chatReceipt.upsert({
            where: {
              conversationId_eventId_recipientUserId: {
                conversationId: id,
                eventId,
                recipientUserId: actor.id,
              },
            },
            create: { conversationId: id, eventId, recipientUserId: actor.id },
            update: {},
          })
          if (input.read)
            await tx.chatReceipt.updateMany({
              where: {
                conversationId: id,
                eventId,
                recipientUserId: actor.id,
                readAt: null,
              },
              data: { readAt: new Date() },
            })
        }
        return { acknowledged: input.eventIds }
      },
      { timeout: 10000, maxWait: 3000 },
    )
  }
  /**
   * Recebe bytes já cifrados de ponta a ponta (AES-256-CTR no cliente), grava no
   * bucket privado e registra metadados mínimos com expiração de 90 dias.
   */
  async uploadMedia(
    actor: ConversationActor,
    headers: DeviceHeaders,
    conversationId: string,
    data: Buffer,
  ) {
    await this.device(actor, headers)
    await this.conversation(actor, conversationId, true)
    if (!data || !data.length)
      throw new BadRequestException('O arquivo enviado está vazio.')
    if (data.length > CHAT_MEDIA_MAX_BYTES)
      throw new BadRequestException('O arquivo excede o limite de 50 MB.')
    if (!this.storage)
      throw new ServiceUnavailableException(
        'Armazenamento de mídia indisponível.',
      )
    const id = randomUUID()
    const objectKey = `chat-media/${conversationId}/${id}.enc`
    const expiresAt = new Date(
      Date.now() + CHAT_MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    )
    await this.storage.uploadEncryptedBlob(objectKey, data)
    await this.db.chatAttachment.create({
      data: {
        id,
        conversationId,
        uploaderId: actor.id,
        objectKey,
        sizeBytes: data.length,
        expiresAt,
      },
    })
    return {
      id,
      sizeBytes: data.length,
      expiresAt: expiresAt.toISOString(),
    }
  }
  /** Baixa anexo cifrado garantindo pertencimento à conversa e validade de 90 dias. */
  async downloadMedia(
    actor: ConversationActor,
    headers: DeviceHeaders,
    conversationId: string,
    attachmentId: string,
  ) {
    await this.device(actor, headers)
    await this.conversation(actor, conversationId, false)
    const row = await this.db.chatAttachment.findFirst({
      where: { id: attachmentId, conversationId },
    })
    if (!row) throw new NotFoundException('Arquivo não encontrado.')
    if (row.deletedAt || row.expiresAt <= new Date())
      throw new GoneException('Este arquivo expirou após 90 dias.')
    if (!this.storage)
      throw new ServiceUnavailableException(
        'Armazenamento de mídia indisponível.',
      )
    const buffer = await this.storage.downloadEncryptedBlob(row.objectKey)
    return { buffer, sizeBytes: row.sizeBytes }
  }
  /** Limpeza diária de anexos cifrados que passaram dos 90 dias de retenção. */
  @Cron('0 4 * * *')
  async purgeExpiredAttachments() {
    if (!this.storage) return 0
    const now = new Date()
    const expired = await this.db.chatAttachment.findMany({
      where: { deletedAt: null, expiresAt: { lte: now } },
      take: 200,
      select: { id: true, objectKey: true },
    })
    for (const row of expired) {
      try {
        await this.storage.delete(row.objectKey)
      } catch {
        /* Objeto já ausente ou indisponível: ainda assim marca como expirado. */
      }
      await this.db.chatAttachment.update({
        where: { id: row.id },
        data: { deletedAt: now },
      })
    }
    return expired.length
  }
}
