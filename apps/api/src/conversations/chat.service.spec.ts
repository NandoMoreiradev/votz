import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { hashSync } from 'bcrypt'
import {
  CHAT_MEDIA_MAX_BYTES,
  CHAT_MEDIA_RETENTION_DAYS,
  ChatService,
  MAX_CHAT_DEVICES,
  MAX_PENDING_CHAT_LINKS,
} from './chat.service'
import { StorageService } from '../storage/storage.service'
import { ChatMatrixService } from './chat-matrix.service'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsGateway } from '../notifications/notifications.gateway'

/**
 * Banco em memória com apenas as operações usadas pelo gerenciamento de
 * aparelhos e pelas consultas de chaves. Não substitui os testes integrados
 * contra PostgreSQL e Synapse reais; isola as regras de autorização.
 */
type Device = {
  id: string
  userId: string
  platform: string
  label: string | null
  secretHash: string
  matrixToken: string
  createdAt: Date
  revokedAt: Date | null
}
type Link = {
  id: string
  userId: string
  platform: string
  label: string | null
  secretHash: string
  code: string
  createdAt: Date
  expiresAt: Date
  decidedAt: Date | null
  approved: boolean | null
  decidedByDeviceId: string | null
}
const KEY = 'ab'.repeat(32)
const SECRET = 'x'.repeat(64)
const alice = { id: '11111111-1111-4111-8111-111111111111', emailVerified: true }
const bob = { id: '22222222-2222-4222-8222-222222222222', emailVerified: true }
const carol = { id: '33333333-3333-4333-8333-333333333333', emailVerified: true }
const mx = (id: string) => `@votz_${id.replace(/-/g, '')}:votz.test`

function fixture() {
  const devices: Device[] = []
  const links: Link[] = []
  const attachments: Array<{
    id: string
    conversationId: string
    uploaderId: string
    objectKey: string
    sizeBytes: number
    createdAt: Date
    expiresAt: Date
    deletedAt: Date | null
  }> = []
  const blobs = new Map<string, Buffer>()
  const storage = {
    uploadEncryptedBlob: jest.fn(async (key: string, data: Buffer) => {
      blobs.set(key, Buffer.from(data))
    }),
    downloadEncryptedBlob: jest.fn(async (key: string) => {
      const data = blobs.get(key)
      if (!data) throw new NotFoundException()
      return data
    }),
    delete: jest.fn(async (key: string) => {
      blobs.delete(key)
    }),
  }
  const receipts: Array<{
    conversationId: string
    eventId: string
    recipientUserId: string
    deliveredAt: Date
    readAt: Date | null
  }> = []
  const matchUser = (value: unknown, id: string) =>
    typeof value === 'string'
      ? value === id
      : (value as { in: string[] }).in.includes(id)
  const member = (user: { id: string }, name = 'Pessoa') => ({
    userId: user.id,
    state: 'ACTIVE',
    unreadCount: 0,
    user: { id: user.id, name, banned: false, emailVerified: true },
  })
  const convo = {
    id: 'c1',
    kind: 'DIRECT',
    archivedAt: null,
    matrixRoomId: '!room:test',
    revision: 3,
    lastEventId: null as string | null,
    lastEventAt: null as Date | null,
    lastSenderId: null as string | null,
    members: [member(alice, 'Alice'), member(bob, 'Bruno')],
  }
  const account = {
    password: hashSync('senha-certa', 4) as string | null,
    mfaEnabled: false,
  }
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: { findUnique: jest.fn(async () => account) },
    conversation: {
      findUnique: jest.fn(async () => convo),
      findMany: jest.fn(async () => [convo]),
      update: jest.fn(async ({ data }) => Object.assign(convo, data)),
    },
    conversationBlock: { count: jest.fn(async () => 0) },
    chatAttachment: {
      create: jest.fn(async ({ data }) => {
        const row = { createdAt: new Date(), deletedAt: null, ...data }
        attachments.push(row)
        return row
      }),
      findFirst: jest.fn(async ({ where }) =>
        attachments.find(
          (row) =>
            row.id === where.id && row.conversationId === where.conversationId,
        ) ?? null,
      ),
      findMany: jest.fn(async ({ where }) =>
        attachments.filter(
          (row) =>
            row.deletedAt === null && row.expiresAt <= where.expiresAt.lte,
        ),
      ),
      update: jest.fn(async ({ where, data }) =>
        Object.assign(attachments.find((row) => row.id === where.id)!, data),
      ),
    },
    chatReceipt: {
      findMany: jest.fn(async ({ where }) =>
        receipts.filter(
          (row) =>
            row.conversationId === where.conversationId &&
            matchUser(where.recipientUserId, row.recipientUserId) &&
            where.eventId.in.includes(row.eventId),
        ),
      ),
      upsert: jest.fn(async ({ create }) => {
        if (
          !receipts.some(
            (r) =>
              r.conversationId === create.conversationId &&
              r.eventId === create.eventId &&
              r.recipientUserId === create.recipientUserId,
          )
        )
          receipts.push({ ...create, deliveredAt: new Date(), readAt: null })
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    chatPrivacy: {
      findUnique: jest.fn(async () => ({ readReceiptsEnabled: false })),
    },
    conversationMember: {
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = convo.members.filter(
          (row) =>
            matchUser(where.userId, row.userId) &&
            row.state === where.state &&
            (where.unreadCount?.gt === undefined ||
              row.unreadCount > where.unreadCount.gt),
        )
        for (const row of rows)
          row.unreadCount =
            typeof data.unreadCount === 'number'
              ? data.unreadCount
              : row.unreadCount + data.unreadCount.increment
        return { count: rows.length }
      }),
    },
    chatDevice: {
      findUnique: jest.fn(async ({ where }) =>
        devices.find((row) => row.id === where.id) ?? null,
      ),
      count: jest.fn(async ({ where }) =>
        devices.filter(
          (row) => row.userId === where.userId && !row.revokedAt,
        ).length,
      ),
      create: jest.fn(async ({ data }) => {
        const row = { label: null, revokedAt: null, createdAt: new Date(), ...data }
        devices.push(row)
        return row
      }),
      findMany: jest.fn(async ({ where }) =>
        devices
          .filter(
            (row) =>
              matchUser(where.userId, row.userId) &&
              (where.revokedAt === null ? !row.revokedAt : true),
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = devices.filter(
          (row) =>
            (where.id === undefined || row.id === where.id) &&
            row.userId === where.userId &&
            !row.revokedAt,
        )
        rows.forEach((row) => Object.assign(row, data))
        return { count: rows.length }
      }),
    },
    chatDeviceLink: {
      findUnique: jest.fn(async ({ where }) =>
        links.find((row) => row.id === where.id) ?? null,
      ),
      findMany: jest.fn(async ({ where }) =>
        links.filter(
          (row) =>
            row.userId === where.userId &&
            !row.decidedAt &&
            row.expiresAt > where.expiresAt.gt,
        ),
      ),
      deleteMany: jest.fn(async ({ where }) => {
        for (let i = links.length - 1; i >= 0; i--)
          if (
            links[i].userId === where.userId &&
            (!where.expiresAt || links[i].expiresAt <= where.expiresAt.lte)
          )
            links.splice(i, 1)
      }),
      count: jest.fn(async ({ where }) =>
        links.filter((row) => row.userId === where.userId && !row.decidedAt)
          .length,
      ),
      create: jest.fn(async ({ data }) => {
        const row = {
          label: null,
          decidedAt: null,
          approved: null,
          decidedByDeviceId: null,
          createdAt: new Date(),
          ...data,
        }
        links.push(row)
        return row
      }),
      delete: jest.fn(async ({ where }) => {
        links.splice(links.findIndex((row) => row.id === where.id), 1)
      }),
      update: jest.fn(async ({ where, data }) =>
        Object.assign(links.find((row) => row.id === where.id)!, data),
      ),
    },
  }
  const db = {
    ...tx,
    $transaction: jest.fn(async (callback) => callback(tx)),
  }
  const matrix = {
    enabled: () => true,
    admin: jest.fn().mockResolvedValue('admin-token'),
    provision: jest.fn().mockResolvedValue(undefined),
    room: jest.fn().mockResolvedValue('!room:test'),
    join: jest.fn().mockResolvedValue(undefined),
    kick: jest.fn().mockResolvedValue(undefined),
    userId: mx,
    serverName: () => 'votz.test',
    login: jest.fn(async (localpart: string, deviceId: string) => ({
      user_id: `@${localpart}:votz.test`,
      device_id: deviceId,
      access_token: `token-${deviceId}`,
    })),
    request: jest.fn().mockResolvedValue({}),
  }
  const matrixUserOf = { current: mx(alice.id) }
  const emit = jest.fn()
  const pushQueue = { add: jest.fn().mockResolvedValue(undefined) }
  const service = new ChatService(
    db as unknown as PrismaService,
    new ConfigService({ CHAT_TOKEN_ENCRYPTION_KEY: KEY }),
    matrix as unknown as ChatMatrixService,
    { emitToUser: emit } as unknown as NotificationsGateway,
    storage as unknown as StorageService,
    pushQueue as unknown as import('bullmq').Queue,
  )
  const input = (id = randomUUID(), platform = 'android') => ({
    id,
    secret: SECRET,
    platform,
  })
  const headers = (id: string) => ({ id, secret: SECRET })
  return {
    service,
    db,
    devices,
    links,
    receipts,
    attachments,
    blobs,
    storage,
    pushQueue,
    matrix,
    input,
    headers,
    convo,
    member,
    tx,
    emit,
    account,
  }
}

describe('ChatService: aparelhos conectados', () => {
  it('ativa o primeiro aparelho sem pedir aprovação', async () => {
    const { service, devices, matrix, input } = fixture()
    const first = input()
    const result = await service.enroll(alice, first)
    expect(result).toMatchObject({ status: 'ready', deviceId: first.id })
    expect(devices).toHaveLength(1)
    expect(matrix.login).toHaveBeenCalledTimes(1)
  })

  it('é idempotente para o mesmo aparelho e recusa segredo diferente', async () => {
    const { service, devices, input } = fixture()
    const first = input()
    await service.enroll(alice, first)
    await expect(service.enroll(alice, first)).resolves.toMatchObject({
      status: 'ready',
    })
    await expect(
      service.enroll(alice, { ...first, secret: 'y'.repeat(64) }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(devices).toHaveLength(1)
  })

  it('um segundo aparelho vira pedido pendente e não recebe credenciais', async () => {
    const { service, devices, links, matrix, input } = fixture()
    await service.enroll(alice, input())
    matrix.login.mockClear()
    const second = input(randomUUID(), 'web')
    const waiting = await service.enroll(alice, second)
    expect(waiting).toMatchObject({ status: 'pending_approval' })
    expect((waiting as { code: string }).code).toMatch(/^\d{6}$/)
    expect(matrix.login).not.toHaveBeenCalled()
    expect(devices).toHaveLength(1)
    expect(links).toHaveLength(1)
    // Repetir o pedido mostra o mesmo código, sem criar outro.
    await expect(service.enroll(alice, second)).resolves.toEqual(waiting)
    expect(links).toHaveLength(1)
  })

  it('só ativa o aparelho depois da aprovação de um aparelho ativo', async () => {
    const { service, devices, links, input, headers } = fixture()
    const first = input()
    await service.enroll(alice, first)
    const second = input(randomUUID(), 'web')
    await service.enroll(alice, second)
    const list = await service.devices(alice, headers(first.id))
    expect(list.links).toHaveLength(1)
    expect(list.devices).toEqual([
      expect.objectContaining({ id: first.id, current: true }),
    ])
    await expect(
      service.decideLink(alice, headers(first.id), second.id, true),
    ).resolves.toEqual({ approved: true })
    await expect(service.enroll(alice, second)).resolves.toMatchObject({
      status: 'ready',
      deviceId: second.id,
    })
    expect(devices.map((row) => row.id)).toEqual([first.id, second.id])
    expect(links).toHaveLength(0)
  })

  it('recusar o pedido impede a ativação', async () => {
    const { service, devices, input, headers } = fixture()
    const first = input()
    await service.enroll(alice, first)
    const second = input(randomUUID(), 'web')
    await service.enroll(alice, second)
    await service.decideLink(alice, headers(first.id), second.id, false)
    await expect(service.enroll(alice, second)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(devices).toHaveLength(1)
  })

  it('o aparelho candidato não consegue aprovar a si mesmo', async () => {
    const { service, input, headers } = fixture()
    await service.enroll(alice, input())
    const second = input(randomUUID(), 'web')
    await service.enroll(alice, second)
    // O candidato ainda não é um dispositivo ativo: sem credenciais válidas.
    await expect(
      service.decideLink(alice, headers(second.id), second.id, true),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('não responde pedidos de outra conta nem pedidos já decididos', async () => {
    const f = fixture()
    const a = f.input()
    await f.service.enroll(alice, a)
    const candidate = f.input(randomUUID(), 'web')
    await f.service.enroll(alice, candidate)
    const b = f.input()
    f.matrix.login.mockImplementationOnce(async (_l: string, id: string) => ({
      user_id: mx(bob.id),
      device_id: id,
      access_token: 't',
    }))
    await f.service.enroll(bob, b)
    await expect(
      f.service.decideLink(bob, f.headers(b.id), candidate.id, true),
    ).rejects.toBeInstanceOf(NotFoundException)
    await f.service.decideLink(alice, f.headers(a.id), candidate.id, true)
    await expect(
      f.service.decideLink(alice, f.headers(a.id), candidate.id, false),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('pedido expirado não ativa o aparelho', async () => {
    const { service, links, input, headers } = fixture()
    const first = input()
    await service.enroll(alice, first)
    const second = input(randomUUID(), 'web')
    await service.enroll(alice, second)
    await service.decideLink(alice, headers(first.id), second.id, true)
    links[0].expiresAt = new Date(Date.now() - 1000)
    await expect(service.enroll(alice, second)).rejects.toBeInstanceOf(
      GoneException,
    )
  })

  it('limita aparelhos ativos e pedidos pendentes', async () => {
    const { service, devices, input } = fixture()
    await service.enroll(alice, input())
    for (let i = 0; i < MAX_PENDING_CHAT_LINKS; i++)
      await service.enroll(alice, input(randomUUID(), 'web'))
    await expect(
      service.enroll(alice, input(randomUUID(), 'web')),
    ).rejects.toMatchObject({ status: 429 })
    while (devices.length < MAX_CHAT_DEVICES)
      devices.push({
        id: randomUUID(),
        userId: alice.id,
        platform: 'web',
        label: null,
        secretHash: 'h',
        matrixToken: 't',
        createdAt: new Date(),
        revokedAt: null,
      })
    await expect(
      service.enroll(alice, input(randomUUID(), 'web')),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('desconectar revoga o aparelho e ele perde o acesso', async () => {
    const { service, devices, matrix, input, headers } = fixture()
    const first = input()
    await service.enroll(alice, first)
    const second = input(randomUUID(), 'web')
    await service.enroll(alice, second)
    await service.decideLink(alice, headers(first.id), second.id, true)
    await service.enroll(alice, second)
    await expect(
      service.revokeDevice(alice, headers(first.id), second.id),
    ).resolves.toEqual({ revoked: true, self: false })
    expect(devices.find((row) => row.id === second.id)?.revokedAt).toBeTruthy()
    expect(matrix.request).toHaveBeenCalledWith(
      expect.stringContaining(`/devices/${second.id}`),
      'DELETE',
      undefined,
      'admin-token',
    )
    await expect(
      service.devices(alice, headers(second.id)),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(
      service.revokeDevice(alice, headers(first.id), second.id),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('revogar continua valendo se o transporte estiver indisponível', async () => {
    const { service, devices, matrix, input, headers } = fixture()
    const first = input()
    await service.enroll(alice, first)
    matrix.request.mockRejectedValueOnce(new HttpException('down', 503))
    await expect(
      service.revokeDevice(alice, headers(first.id), first.id),
    ).resolves.toEqual({ revoked: true, self: true })
    expect(devices[0].revokedAt).toBeTruthy()
  })
})

describe('ChatService: chaves e eventos entre aparelhos', () => {
  async function twoDevices() {
    const f = fixture()
    const first = f.input()
    const second = f.input(randomUUID(), 'web')
    await f.service.enroll(alice, first)
    await f.service.enroll(alice, second)
    await f.service.decideLink(alice, f.headers(first.id), second.id, true)
    await f.service.enroll(alice, second)
    return { ...f, first, second }
  }
  const olm = {
    algorithm: 'm.olm.v1.curve25519-aes-sha2',
    sender_key: 'k',
    ciphertext: { c: { type: 0, body: 'b' } },
  }

  it('entrega eventos cifrados para os outros aparelhos da própria conta', async () => {
    const { service, matrix, first, second, headers } = await twoDevices()
    matrix.request.mockClear()
    await service.toDevice(
      alice,
      headers(first.id),
      'm.room.encrypted',
      'txn1',
      { messages: { [mx(alice.id)]: { [second.id]: olm } } },
    )
    expect(matrix.request).toHaveBeenCalledTimes(1)
  })

  it('recusa curinga, aparelho revogado, o próprio remetente e destinos vazios', async () => {
    const { service, devices, first, second, headers } = await twoDevices()
    const send = (messages: unknown) =>
      service.toDevice(alice, headers(first.id), 'm.room.encrypted', 't', {
        messages: messages as Record<string, unknown>,
      })
    await expect(
      send({ [mx(alice.id)]: { '*': olm } }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      send({ [mx(alice.id)]: { [first.id]: olm } }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(send({ [mx(alice.id)]: {} })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    devices.find((row) => row.id === second.id)!.revokedAt = new Date()
    await expect(
      send({ [mx(alice.id)]: { [second.id]: olm } }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('recusa conteúdo em claro mesmo para um aparelho válido', async () => {
    const { service, first, second, headers } = await twoDevices()
    await expect(
      service.toDevice(alice, headers(first.id), 'm.room.encrypted', 't', {
        messages: {
          [mx(alice.id)]: { [second.id]: { algorithm: 'plain', body: 'oi' } },
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('consultas de chaves nunca expõem aparelhos revogados', async () => {
    const { service, devices, matrix, first, second, headers } =
      await twoDevices()
    devices.find((row) => row.id === second.id)!.revokedAt = new Date()
    matrix.request.mockResolvedValueOnce({
      device_keys: {
        [mx(alice.id)]: { [first.id]: { k: 1 }, [second.id]: { k: 2 }, GHOST: {} },
      },
    })
    const result = await service.keys(alice, headers(first.id), 'query', {
      device_keys: { [mx(alice.id)]: [] },
    })
    expect(Object.keys(result.device_keys[mx(alice.id)])).toEqual([first.id])
  })

  it('reivindicações de chaves descartam aparelhos revogados antes de chegar ao transporte', async () => {
    const { service, devices, matrix, first, second, headers } =
      await twoDevices()
    devices.find((row) => row.id === second.id)!.revokedAt = new Date()
    matrix.request.mockClear()
    const result = await service.keys(alice, headers(first.id), 'claim', {
      one_time_keys: { [mx(alice.id)]: { [second.id]: 'signed_curve25519' } },
    })
    expect(result).toEqual({ one_time_keys: {}, failures: {} })
    expect(matrix.request).not.toHaveBeenCalled()
  })

  it('não aceita envio de mensagem em claro', async () => {
    const { service, first, headers } = await twoDevices()
    await expect(
      service.send(alice, headers(first.id), randomUUID(), 'txn', {
        revision: 1,
        content: { msgtype: 'm.text', body: 'oi' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('ChatService: lista de conversas (última mensagem e não lidas)', () => {
  const envelope = {
    algorithm: 'm.megolm.v1.aes-sha2',
    ciphertext: 'opaque',
    sender_key: 'key',
    session_id: 'session',
  }
  async function enrolled() {
    const f = fixture()
    const device = f.input()
    await f.service.enroll(alice, device)
    f.emit.mockClear()
    return { ...f, device }
  }
  const send = (
    f: Awaited<ReturnType<typeof enrolled>>,
    txn = 'txn-1',
  ) =>
    f.service.send(alice, f.headers(f.device.id), 'c1', txn, {
      revision: 3,
      content: envelope,
    })

  it('registra horário, autoria e conta uma não lida só para a outra pessoa', async () => {
    const f = await enrolled()
    f.matrix.request.mockResolvedValueOnce({ event_id: '$e1' })
    await expect(send(f)).resolves.toEqual({ event_id: '$e1' })
    expect(f.convo.lastEventId).toBe('$e1')
    expect(f.convo.lastSenderId).toBe(alice.id)
    expect(f.convo.lastEventAt).toBeInstanceOf(Date)
    const unread = Object.fromEntries(
      f.convo.members.map((m) => [m.userId, m.unreadCount]),
    )
    expect(unread).toEqual({ [alice.id]: 0, [bob.id]: 1 })
  })

  it('repetir a mesma transação não conta duas vezes', async () => {
    const f = await enrolled()
    f.matrix.request.mockResolvedValue({ event_id: '$e1' })
    await send(f)
    await send(f)
    expect(f.convo.members.find((m) => m.userId === bob.id)!.unreadCount).toBe(1)
    f.matrix.request.mockResolvedValue({ event_id: '$e2' })
    await send(f, 'txn-2')
    expect(f.convo.members.find((m) => m.userId === bob.id)!.unreadCount).toBe(2)
  })

  it('avisa as duas listas (só id e revisão, sem conteúdo) depois de enviar', async () => {
    const f = await enrolled()
    f.matrix.request.mockResolvedValueOnce({ event_id: '$e1' })
    await send(f)
    expect(f.emit).toHaveBeenCalledTimes(2)
    for (const [, event, payload] of f.emit.mock.calls) {
      expect(event).toBe('conversation:changed')
      expect(Object.keys(payload).sort()).toEqual(['conversationId', 'revision'])
    }
    expect(f.emit.mock.calls.map((c) => c[0]).sort()).toEqual(
      [alice.id, bob.id].sort(),
    )
  })

  it('uma falha no transporte não altera a lista nem avisa ninguém', async () => {
    const f = await enrolled()
    f.matrix.request.mockRejectedValueOnce(new HttpException('down', 503))
    await expect(send(f)).rejects.toBeInstanceOf(HttpException)
    expect(f.convo.lastEventId).toBeNull()
    expect(f.convo.members.every((m) => m.unreadCount === 0)).toBe(true)
    expect(f.emit).not.toHaveBeenCalled()
  })

  it('uma falha ao avisar a lista não derruba o envio', async () => {
    const f = await enrolled()
    f.emit.mockImplementation(() => {
      throw new Error('socket down')
    })
    f.matrix.request.mockResolvedValueOnce({ event_id: '$e1' })
    await expect(send(f)).resolves.toEqual({ event_id: '$e1' })
  })

  it('abrir a conversa zera só o contador de quem abriu e avisa só os aparelhos dessa pessoa', async () => {
    const f = await enrolled()
    f.matrix.request.mockResolvedValueOnce({ event_id: '$e1' })
    await send(f)
    f.emit.mockClear()
    // Bob não tem aparelho neste teste; quem abre é a própria Alice (contador 0): nada a limpar.
    await f.service.seen(alice, f.headers(f.device.id), 'c1')
    expect(f.emit).not.toHaveBeenCalled()
    f.convo.members.find((m) => m.userId === alice.id)!.unreadCount = 4
    await expect(
      f.service.seen(alice, f.headers(f.device.id), 'c1'),
    ).resolves.toEqual({ unreadCount: 0 })
    expect(
      Object.fromEntries(f.convo.members.map((m) => [m.userId, m.unreadCount])),
    ).toEqual({ [alice.id]: 0, [bob.id]: 1 })
    expect(f.emit).toHaveBeenCalledTimes(1)
    expect(f.emit.mock.calls[0][0]).toBe(alice.id)
  })

  it('só quem tem aparelho ativo da própria conta marca como visto', async () => {
    const f = fixture()
    await expect(
      f.service.seen(alice, f.headers(randomUUID()), 'c1'),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})

describe('ChatService: redefinição e aparelho desconectado', () => {
  async function twoDevices() {
    const f = fixture()
    const first = f.input()
    const second = f.input(randomUUID(), 'web')
    await f.service.enroll(alice, first)
    await f.service.enroll(alice, second) // pedido pendente
    return { ...f, first, second }
  }

  it('com a senha certa desconecta todos os aparelhos e apaga pedidos pendentes', async () => {
    const f = await twoDevices()
    await expect(f.service.reset(alice, 'senha-certa')).resolves.toEqual({
      reset: true,
      disconnected: 1,
    })
    expect(f.devices.every((row) => row.revokedAt)).toBe(true)
    expect(f.links).toHaveLength(0)
    // Sem aparelho ativo, o próximo vira o primeiro e entra direto.
    const fresh = f.input()
    await expect(f.service.enroll(alice, fresh)).resolves.toMatchObject({
      status: 'ready',
      deviceId: fresh.id,
    })
  })

  it('senha errada não desconecta ninguém', async () => {
    const f = await twoDevices()
    await expect(f.service.reset(alice, 'senha-errada')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(f.devices.every((row) => !row.revokedAt)).toBe(true)
    expect(f.links).toHaveLength(1)
  })

  it('contas sem senha ou com verificação em duas etapas recebem uma explicação e nada muda', async () => {
    const noPassword = await twoDevices()
    noPassword.account.password = null
    await expect(noPassword.service.reset(alice, 'x')).rejects.toThrow(/precisa ter uma senha/)
    const mfa = await twoDevices()
    mfa.account.mfaEnabled = true
    await expect(mfa.service.reset(alice, 'senha-certa')).rejects.toThrow(/duas etapas/)
    for (const f of [noPassword, mfa]) {
      expect(f.devices.every((row) => !row.revokedAt)).toBe(true)
    }
  })

  it('a redefinição vale mesmo se o transporte estiver fora do ar', async () => {
    const f = await twoDevices()
    f.matrix.request.mockRejectedValue(new HttpException('down', 503))
    await expect(f.service.reset(alice, 'senha-certa')).resolves.toMatchObject({
      reset: true,
    })
    expect(f.devices.every((row) => row.revokedAt)).toBe(true)
  })

  it('um aparelho já desconectado recebe 423, para o app recomeçar sozinho', async () => {
    const f = await twoDevices()
    await f.service.revokeDevice(alice, f.headers(f.first.id), f.first.id)
    await expect(f.service.enroll(alice, f.first)).rejects.toMatchObject({
      status: 423,
    })
    // Segredo diferente continua sendo conflito, não revela que o aparelho existiu.
    await expect(
      f.service.enroll(alice, { ...f.first, secret: 'y'.repeat(64) }),
    ).rejects.toBeInstanceOf(ConflictException)
  })
})

describe('ChatService: texto em grupo', () => {
  async function groupFixture() {
    const f = fixture()
    f.convo.kind = 'GROUP'
    f.convo.members = [
      f.member(alice, 'Alice'),
      f.member(bob, 'Bruno'),
      f.member(carol, 'Carol'),
    ]
    const aDev = f.input()
    const bDev = f.input()
    const cDev = f.input()
    await f.service.enroll(alice, aDev)
    await f.service.enroll(bob, bDev)
    await f.service.enroll(carol, cDev)
    return { ...f, aDev, bDev, cDev }
  }

  it('transport devolve todos os membros ativos do grupo com seus aparelhos e sincroniza a sala', async () => {
    const f = await groupFixture()
    const room = await f.service.transport(alice, f.headers(f.aDev.id), 'c1')
    expect(room.kind).toBe('GROUP')
    expect(room.peer).toBeNull()
    expect(room.canSend).toBe(true)
    expect(room.peers).toEqual([
      {
        userId: bob.id,
        name: 'Bruno',
        matrixUserId: mx(bob.id),
        deviceId: f.bDev.id,
        devices: [f.bDev.id],
      },
      {
        userId: carol.id,
        name: 'Carol',
        matrixUserId: mx(carol.id),
        deviceId: f.cDev.id,
        devices: [f.cDev.id],
      },
    ])
    expect(f.matrix.join).toHaveBeenCalledWith('!room:test', alice.id)
  })

  it('enviar mensagem no grupo incrementa não lidas de todos os outros membros ativos', async () => {
    const f = await groupFixture()
    f.matrix.request.mockResolvedValueOnce({ event_id: '$g1' })
    await f.service.send(alice, f.headers(f.aDev.id), 'c1', 'txn-g1', {
      revision: 3,
      content: {
        algorithm: 'm.megolm.v1.aes-sha2',
        ciphertext: 'cipher',
        device_id: f.aDev.id,
        sender_key: 'k',
        session_id: 's',
      },
    })
    expect(f.convo.members[0].unreadCount).toBe(0)
    expect(f.convo.members[1].unreadCount).toBe(1)
    expect(f.convo.members[2].unreadCount).toBe(1)
    expect(f.emit).toHaveBeenCalledTimes(3)
  })

  it('grupo sem outro participante ativo ainda não permite envio', async () => {
    const f = await groupFixture()
    f.convo.members[1].state = 'INVITED'
    f.convo.members[2].state = 'INVITED'
    const room = await f.service.transport(alice, f.headers(f.aDev.id), 'c1')
    expect(room.canSend).toBe(false)
    expect(room.peers).toEqual([])
    await expect(
      f.service.send(alice, f.headers(f.aDev.id), 'c1', 'txn-empty', {
        revision: 3,
        content: {
          algorithm: 'm.megolm.v1.aes-sha2',
          ciphertext: 'cipher',
          device_id: f.aDev.id,
          sender_key: 'k',
          session_id: 's',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('recibos em grupo agregam entregas e leituras por mensagem e bloqueiam autoconfirmação', async () => {
    const f = await groupFixture()
    f.receipts.push(
      {
        conversationId: 'c1',
        eventId: '$g1',
        recipientUserId: bob.id,
        deliveredAt: new Date('2026-11-19T12:00:00Z'),
        readAt: new Date('2026-11-19T12:01:00Z'),
      },
      {
        conversationId: 'c1',
        eventId: '$g1',
        recipientUserId: carol.id,
        deliveredAt: new Date('2026-11-19T12:00:30Z'),
        readAt: null,
      },
    )
    const { receipts } = await f.service.receipts(alice, f.headers(f.aDev.id), 'c1', ['$g1'])
    expect(receipts).toHaveLength(1)
    expect(receipts[0]).toMatchObject({
      eventId: '$g1',
      deliveredCount: 2,
      readCount: 1,
      totalRecipients: 2,
    })
    // Remetente não pode confirmar recebimento da própria mensagem no grupo.
    f.matrix.request.mockResolvedValueOnce({
      type: 'm.room.encrypted',
      sender: mx(alice.id),
    })
    await expect(
      f.service.acknowledge(alice, f.headers(f.aDev.id), 'c1', {
        eventIds: ['$g1'],
        read: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('ChatService: mídia cifrada (Etapa 2, retenção 90 dias)', () => {
  it('sobe e baixa bytes cifrados opacos com expiração de 90 dias e isola por conversa', async () => {
    const f = fixture()
    const aDev = f.input()
    const bDev = f.input()
    await f.service.enroll(alice, aDev)
    await f.service.enroll(bob, bDev)

    const cipher = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
    const uploaded = await f.service.uploadMedia(alice, f.headers(aDev.id), 'c1', cipher)
    expect(uploaded.sizeBytes).toBe(8)
    const days =
      (new Date(uploaded.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThan(CHAT_MEDIA_RETENTION_DAYS - 1)
    expect(days).toBeLessThanOrEqual(CHAT_MEDIA_RETENTION_DAYS + 0.1)

    const downloaded = await f.service.downloadMedia(
      bob,
      f.headers(bDev.id),
      'c1',
      uploaded.id,
    )
    expect(downloaded.buffer.equals(cipher)).toBe(true)

    // Outro id ou conversa inexistente retorna 404.
    await expect(
      f.service.downloadMedia(bob, f.headers(bDev.id), 'c1', randomUUID()),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejeita arquivo vazio ou acima de 50 MB e retorna 410 após expiração + purga', async () => {
    const f = fixture()
    const aDev = f.input()
    await f.service.enroll(alice, aDev)

    await expect(
      f.service.uploadMedia(alice, f.headers(aDev.id), 'c1', Buffer.alloc(0)),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      f.service.uploadMedia(
        alice,
        f.headers(aDev.id),
        'c1',
        Buffer.alloc(CHAT_MEDIA_MAX_BYTES + 1),
      ),
    ).rejects.toBeInstanceOf(BadRequestException)

    const uploaded = await f.service.uploadMedia(
      alice,
      f.headers(aDev.id),
      'c1',
      Buffer.from('ciphertext'),
    )
    f.attachments[0].expiresAt = new Date(Date.now() - 1000)
    await expect(
      f.service.downloadMedia(alice, f.headers(aDev.id), 'c1', uploaded.id),
    ).rejects.toBeInstanceOf(GoneException)

    const purged = await f.service.purgeExpiredAttachments()
    expect(purged).toBe(1)
    expect(f.storage.delete).toHaveBeenCalledTimes(1)
    expect(f.attachments[0].deletedAt).not.toBeNull()
  })
})

describe('ChatService: push discreto por aparelho (Etapa 2B)', () => {
  it('registra e limpa pushToken, apaga ao revogar aparelho e enfileira push idempotente no envio', async () => {
    const f = fixture()
    const aDev = f.input()
    const bDev = f.input()
    await f.service.enroll(alice, aDev)
    await f.service.enroll(bob, bDev)

    await f.service.registerPushToken(
      bob,
      f.headers(bDev.id),
      'ExponentPushToken[abc1234567890]',
    )
    expect(
      (f.devices.find((d) => d.id === bDev.id) as unknown as { pushToken?: string })
        ?.pushToken,
    ).toBe('ExponentPushToken[abc1234567890]')

    // Enviar mensagem enfileira job discreto na fila BullMQ sem texto em claro.
    f.matrix.request.mockResolvedValueOnce({ event_id: '$p1' })
    await f.service.send(alice, f.headers(aDev.id), 'c1', 'txn-p1', {
      revision: 3,
      content: {
        algorithm: 'm.megolm.v1.aes-sha2',
        ciphertext: 'cipher',
        device_id: aDev.id,
        sender_key: 'k',
        session_id: 's',
      },
    })
    expect(f.pushQueue.add).toHaveBeenCalledWith(
      'discrete-push',
      { conversationId: 'c1', recipientUserIds: [bob.id], eventId: '$p1' },
      expect.objectContaining({ jobId: 'push:c1:$p1' }),
    )

    // Revogar aparelho limpa imediatamente o pushToken.
    await f.service.revokeDevice(bob, f.headers(bDev.id), bDev.id)
    expect(
      (f.devices.find((d) => d.id === bDev.id) as unknown as { pushToken?: string | null })
        ?.pushToken,
    ).toBeNull()
  })
})

describe('ChatService: digitando efêmero e silenciar (Etapa 3B)', () => {
  it('não enfileira push para membro que silenciou a conversa, mas mantém unreadCount', async () => {
    const f = fixture()
    const aDev = f.input()
    await f.service.enroll(alice, aDev)
    const bobMember = f.convo.members.find((m) => m.userId === bob.id) as unknown as {
      mutedUntil?: Date | null
    }
    bobMember.mutedUntil = new Date(Date.now() + 60 * 60 * 1000)

    f.matrix.request.mockResolvedValueOnce({ event_id: '$muted1' })
    await f.service.send(alice, f.headers(aDev.id), 'c1', 'txn-m1', {
      revision: 3,
      content: {
        algorithm: 'm.megolm.v1.aes-sha2',
        ciphertext: 'cipher',
        device_id: aDev.id,
        sender_key: 'k',
        session_id: 's',
      },
    })
    expect(f.pushQueue.add).not.toHaveBeenCalled()
    expect(f.convo.members.find((m) => m.userId === bob.id)?.unreadCount).toBe(1)
  })

  it('propaga aviso efêmero de digitando apenas aos outros participantes sem gravar no banco', async () => {
    const f = fixture()
    f.emit.mockClear()
    await expect(f.service.typing(alice, 'c1', true)).resolves.toEqual({ ok: true })
    expect(f.emit).toHaveBeenCalledTimes(1)
    expect(f.emit).toHaveBeenCalledWith(bob.id, 'conversation:typing', {
      conversationId: 'c1',
      userId: alice.id,
      userName: 'Alice',
      typing: true,
    })
  })
})
