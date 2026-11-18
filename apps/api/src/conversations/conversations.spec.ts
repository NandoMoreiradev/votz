import { ConfigService } from '@nestjs/config'
import { NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ConversationsService } from './conversations.service'
import { ConversationsOutbox } from './conversations.outbox'
import { RespondConversationDto } from './conversations.dto'
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
