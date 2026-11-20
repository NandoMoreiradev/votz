import { ConfigService } from '@nestjs/config'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ConversationsService } from './conversations.service'
import { ConversationsOutbox } from './conversations.outbox'
import { RespondConversationDto, UpdateConversationSettingsDto } from './conversations.dto'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsGateway } from '../notifications/notifications.gateway'

describe('Conversation privacy and delivery gates', () => {
  const disabled = new ConfigService({ CONVERSATIONS_ENABLED: 'false' })
  const enabled = new ConfigService({ CONVERSATIONS_ENABLED: 'true' })
  it('does not access the database while disabled', async () => {
    const service = new ConversationsService({} as PrismaService, disabled)
    expect(service.capabilities()).toEqual({
      enabled: false,
      messagingEnabled: false,
      callsEnabled: false,
    })
    await expect(
      service.direct({ id: 'actor', emailVerified: true }, 'target'),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
  it.each(['false', 'true', 0, 1, null, undefined])(
    'rejects non-boolean consent %s even with implicit conversion',
    async (value) => {
      const dto = plainToInstance(
        RespondConversationDto,
        { accept: value },
        { enableImplicitConversion: true },
      )
      expect((await validate(dto)).length).toBeGreaterThan(0)
    },
  )
  it.each([true, false])('accepts explicit boolean consent %s', async (value) => {
    expect(
      await validate(
        plainToInstance(
          RespondConversationDto,
          { accept: value },
          { enableImplicitConversion: true },
        ),
      ),
    ).toHaveLength(0)
  })
  function fixture(fail = false) {
    const row = {
      id: 'event',
      conversationId: 'conversation',
      recipientUserId: 'user',
      revision: 3,
      attempts: 1,
    }
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: row.id }]),
      conversationOutbox: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([row]),
      },
    }
    const mark = jest.fn().mockResolvedValue({ count: 1 })
    const db = {
      $transaction: jest.fn(async (callback) => callback(tx)),
      conversationOutbox: { updateMany: mark },
    }
    const emit = jest.fn(() => {
      if (fail) throw new Error('Transport unavailable')
    })
    const worker = new ConversationsOutbox(
      db as unknown as PrismaService,
      { emitToUser: emit } as unknown as NotificationsGateway,
      enabled,
    )
    return { worker, emit, mark, tx }
  }
  it('keeps durable events pending after a transport failure', async () => {
    const { worker, mark, tx } = fixture(true)
    await worker.dispatch()
    expect(tx.conversationOutbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attempts: { increment: 1 },
          nextAttemptAt: expect.any(Date),
        }),
      }),
    )
    expect(mark).not.toHaveBeenCalled()
  })
  it('emits only invalidation metadata and acknowledges the claimed attempt', async () => {
    const { worker, emit, mark } = fixture()
    await worker.dispatch()
    expect(emit).toHaveBeenCalledWith('user', 'conversation:changed', {
      conversationId: 'conversation',
      revision: 3,
    })
    expect(mark).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'event', attempts: 1, sentAt: null } }),
    )
  })
  it('does not dispatch or prune while the pilot is disabled', async () => {
    const worker = new ConversationsOutbox(
      {} as PrismaService,
      {} as NotificationsGateway,
      disabled,
    )
    await expect(worker.dispatch()).resolves.toBeUndefined()
    await expect(worker.pruneDelivered()).resolves.toBeUndefined()
  })
})

describe('ConversationsService: configurações e políticas (Etapa 6)', () => {
  const actor = { id: 'u-1', emailVerified: true }
  const enabled = new ConfigService({ CONVERSATIONS_ENABLED: 'true' })
  it('retorna defaults quando ainda não há registro e limpa readAt ao desativar confirmação de leitura', async () => {
    const store = new Map<string, Record<string, unknown>>()
    const clearReceipts = jest.fn().mockResolvedValue({ count: 2 })
    const db: Record<string, unknown> = {
      chatPrivacy: {
        findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => store.get(where.userId) ?? null),
        upsert: jest.fn(async ({ where, create, update }: { where: { userId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const next = { ...(store.get(where.userId) ?? create), ...update }
          store.set(where.userId, next)
          return next
        }),
      },
      chatReceipt: { updateMany: clearReceipts },
    }
    db.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db))
    const service = new ConversationsService(db as unknown as PrismaService, enabled)
    const initial = await service.getSettings(actor)
    expect(initial.readReceiptsEnabled).toBe(false)
    expect(initial.fontScale).toBe('MEDIUM')
    expect(initial.wallpaper).toBe('DEFAULT')
    expect(initial.mediaUploadQuality).toBe('NORMAL')

    const updated = await service.updateSettings(actor, {
      readReceiptsEnabled: false,
      fontScale: 'LARGE',
      wallpaper: 'SOFT',
      directRequestPolicy: 'NOBODY',
      mediaUploadQuality: 'HIGH',
    })
    expect(updated.mediaUploadQuality).toBe('HIGH')
    // Um nulo solto não vai para o banco nem apaga a escolha.
    const again = await service.updateSettings(actor, { mediaUploadQuality: null as never })
    expect(again.mediaUploadQuality).toBe('HIGH')
    expect(updated.fontScale).toBe('LARGE')
    expect(updated.wallpaper).toBe('SOFT')
    expect(updated.directRequestPolicy).toBe('NOBODY')
    expect(clearReceipts).toHaveBeenCalledTimes(1)
  })

  it('qualidade dos envios só aceita NORMAL ou HIGH (nada de 4K ou valor solto)', async () => {
    const check = (value: unknown) =>
      validate(plainToInstance(UpdateConversationSettingsDto, { mediaUploadQuality: value }))
    expect(await check('NORMAL')).toHaveLength(0)
    expect(await check('HIGH')).toHaveLength(0)
    for (const bad of ['4K', 'high', 'ULTRA', '', 1]) expect((await check(bad)).length).toBeGreaterThan(0)
    // Ausente (ou nulo) é permitido: a configuração é parcial.
    expect(await validate(plainToInstance(UpdateConversationSettingsDto, {}))).toHaveLength(0)
  })

  it('recusa nova solicitação direta quando destinatário configurou directRequestPolicy = NOBODY', async () => {
    const tx = {
      user: { count: jest.fn().mockResolvedValue(1) },
      conversationBlock: { count: jest.fn().mockResolvedValue(0) },
      conversation: { findUnique: jest.fn().mockResolvedValue(null) },
      chatPrivacy: { findUnique: jest.fn().mockResolvedValue({ directRequestPolicy: 'NOBODY' }) },
    }
    const db = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) }
    const service = new ConversationsService(db as unknown as PrismaService, enabled)
    await expect(service.direct(actor, 'u-2')).rejects.toThrow(ForbiddenException)
  })

  it('recusa criação de grupo quando um convidado configurou groupInvitePolicy = NOBODY', async () => {
    const tx = {
      conversation: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { count: jest.fn().mockResolvedValue(1) },
      conversationBlock: { count: jest.fn().mockResolvedValue(0) },
      chatPrivacy: { findMany: jest.fn().mockResolvedValue([{ userId: 'u-2', groupInvitePolicy: 'NOBODY' }]) },
    }
    const db = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) }
    const service = new ConversationsService(db as unknown as PrismaService, enabled)
    await expect(
      service.group(actor, {
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        title: 'Bairro',
        memberIds: ['u-2'],
      }),
    ).rejects.toThrow(ForbiddenException)
  })
})
