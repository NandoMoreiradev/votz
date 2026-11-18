import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import {
  decryptWithKey,
  encryptWithKey,
  parseHexKey,
} from '../crypto/crypto.service'
import { ConversationActor } from './conversations.service'
import { ChatMatrixService } from './chat-matrix.service'
import {
  ChatReceiptDto,
  EnrollChatDeviceDto,
  SendChatMessageDto,
} from './chat.dto'
import { Prisma } from '@prisma/client'

type Json = Record<string, any>
type DeviceHeaders = { id?: string; secret?: string }
@Injectable()
export class ChatService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly matrix: ChatMatrixService,
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
  async enroll(actor: ConversationActor, input: EnrollChatDeviceDto) {
    this.guard(actor)
    await this.matrix.admin()
    await this.matrix.provision(actor.id)
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`
        const current = await tx.chatDevice.findFirst({
          where: { userId: actor.id, revokedAt: null },
        })
        if (current) {
          if (
            current.id !== input.id ||
            !this.same(current.secretHash, this.hash(input.secret))
          )
            throw new ConflictException(
              'Esta conta já tem um dispositivo de conversas ativado. Use o dispositivo já cadastrado; nenhuma chave será substituída automaticamente.',
            )
        } else {
          if (await tx.chatDevice.findUnique({ where: { id: input.id } }))
            throw new ConflictException(
              'Identificador de dispositivo indisponível.',
            )
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
              secretHash: this.hash(input.secret),
              matrixToken: encryptWithKey(session.access_token, this.key()),
            },
          })
        }
        return {
          deviceId: input.id,
          matrixUserId: this.matrix.userId(actor.id),
          protocol: 'matrix-olm-megolm-v1',
          singleDevicePilot: true,
        }
      },
      { timeout: 15000 },
    )
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
            user: { select: { id: true, banned: true, emailVerified: true } },
          },
        },
      },
    })
    if (
      !c ||
      !c.members.some((m) => m.userId === actor.id && m.state === 'ACTIVE')
    )
      throw new NotFoundException()
    if (
      c.kind !== 'DIRECT' ||
      c.archivedAt ||
      c.members.length !== 2 ||
      c.members.some(
        (m) => m.state !== 'ACTIVE' || m.user.banned || !m.user.emailVerified,
      )
    )
      throw new ConflictException(
        'O envio será liberado após o aceite da conversa individual.',
      )
    const otherId = c.members.find((m) => m.userId !== actor.id)!.userId
    const blocked = await client.conversationBlock.count({
      where: {
        OR: [
          { blockerId: actor.id, blockedId: otherId },
          { blockedId: actor.id, blockerId: otherId },
        ],
      },
    })
    if (write && blocked)
      throw new ForbiddenException('Esta interação está bloqueada.')
    return { c, otherId, canSend: !blocked }
  }
  async transport(
    actor: ConversationActor,
    headers: DeviceHeaders,
    id: string,
  ) {
    await this.device(actor, headers)
    const before = await this.conversation(actor, id)
    if (!before.c.matrixRoomId && !before.canSend)
      throw new ForbiddenException('Esta interação está bloqueada.')
    await this.matrix.admin()
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id} FOR UPDATE`
        const { c, otherId, canSend } = await this.conversation(
          actor,
          id,
          false,
          tx,
        )
        const roomId =
          c.matrixRoomId || (await this.matrix.room(id, [actor.id, otherId]))
        if (!c.matrixRoomId)
          await tx.conversation.update({
            where: { id },
            data: { matrixRoomId: roomId },
          })
        const peer = await tx.chatDevice.findFirst({
          where: { userId: otherId, revokedAt: null },
          select: { id: true },
        })
        return {
          roomId,
          revision: c.revision,
          canSend,
          peer: {
            userId: otherId,
            matrixUserId: this.matrix.userId(otherId),
            deviceId: peer?.id ?? null,
          },
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
    const row = await this.db.conversation.findFirst({
      where: {
        kind: 'DIRECT',
        archivedAt: null,
        AND: [
          { members: { some: { userId: actor.id, state: 'ACTIVE' } } },
          { members: { some: { userId, state: 'ACTIVE' } } },
        ],
      },
      select: { id: true },
    })
    if (!row) throw new ForbiddenException()
    await this.conversation(actor, row.id, write)
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
        Object.keys(targets).length > 20
      )
        throw new BadRequestException()
      for (const userId of Object.keys(targets))
        await this.authorizePeer(actor, userId, operation === 'claim')
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
      const active = await this.db.chatDevice.findFirst({
        where: { userId: peerId, revokedAt: null },
        select: { id: true },
      })
      if (
        !active ||
        !messages ||
        typeof messages !== 'object' ||
        Object.keys(messages).some((id) => id !== active.id)
      )
        throw new ForbiddenException()
      const content = messages[active.id]
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
        kind: 'DIRECT',
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
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id} FOR UPDATE`
        const { c } = await this.conversation(actor, id, true, tx)
        if (!c.matrixRoomId || c.revision !== input.revision)
          throw new ConflictException('Atualize a conversa antes de enviar.')
        return this.matrix.request(
          `/_matrix/client/v3/rooms/${encodeURIComponent(c.matrixRoomId)}/send/m.room.encrypted/${encodeURIComponent(txn)}`,
          'PUT',
          content,
          device.token,
          8000,
        )
      },
      { timeout: 11000, maxWait: 3000 },
    )
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
    const { otherId } = await this.conversation(actor, id)
    return {
      receipts: await this.db.chatReceipt.findMany({
        where: {
          conversationId: id,
          recipientUserId: otherId,
          eventId: { in: eventIds },
        },
        select: { eventId: true, deliveredAt: true, readAt: true },
      }),
    }
  }
  async acknowledge(
    actor: ConversationActor,
    headers: DeviceHeaders,
    id: string,
    input: ChatReceiptDto,
  ) {
    const device = await this.device(actor, headers)
    const { c, otherId } = await this.conversation(actor, id, true)
    if (!c.matrixRoomId) throw new NotFoundException()
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
          if (
            event.type !== 'm.room.encrypted' ||
            event.sender !== this.matrix.userId(otherId)
          )
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
}
