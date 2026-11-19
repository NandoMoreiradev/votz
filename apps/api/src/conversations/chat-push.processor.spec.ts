import { ConfigService } from '@nestjs/config'
import type { Job } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { ChatPushProcessor, type ChatPushJobData } from './chat-push.processor'

describe('ChatPushProcessor (Etapa 2B: push discreto)', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  function setup(enabled = true) {
    const devices = [
      { id: 'd1', userId: 'u2', revokedAt: null, pushToken: 'ExponentPushToken[validToken12345]' },
      { id: 'd2', userId: 'u3', revokedAt: null, pushToken: 'ExponentPushToken[staleToken12345]' },
    ]
    const db = {
      chatDevice: {
        findMany: jest.fn(async ({ where }) =>
          devices.filter(
            (d) =>
              where.userId.in.includes(d.userId) &&
              d.revokedAt === null &&
              d.pushToken !== null,
          ),
        ),
        updateMany: jest.fn(async ({ where, data }) => {
          for (const d of devices)
            if (where.id.in.includes(d.id)) Object.assign(d, data)
          return { count: where.id.in.length }
        }),
      },
    }
    const config = new ConfigService({
      CHAT_PUSH_ENABLED: enabled ? 'true' : 'false',
    })
    const processor = new ChatPushProcessor(db as unknown as PrismaService, config)
    return { processor, db, devices }
  }

  it('não dispara nada quando CHAT_PUSH_ENABLED está desativada (padrão)', async () => {
    const { processor, db } = setup(false)
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await processor.process({
      data: { conversationId: 'c1', recipientUserIds: ['u2'], eventId: '$e1' },
    } as Job<ChatPushJobData>)

    expect(result).toEqual({ sent: 0, cleaned: 0 })
    expect(db.chatDevice.findMany).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('envia payload discreto sem conteúdo em claro e limpa tokens DeviceNotRegistered', async () => {
    const { processor, devices } = setup(true)
    let sentBody: unknown = null
    global.fetch = jest.fn(async (_url, init) => {
      sentBody = JSON.parse(String(init?.body))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { status: 'ok', id: 'ticket-1' },
            { status: 'error', details: { error: 'DeviceNotRegistered' } },
          ],
        }),
      }
    }) as unknown as typeof fetch

    const result = await processor.process({
      data: { conversationId: 'conv-uuid', recipientUserIds: ['u2', 'u3'], eventId: '$e1' },
    } as Job<ChatPushJobData>)

    expect(result).toEqual({ sent: 2, cleaned: 1 })
    const batch = sentBody as Array<Record<string, unknown>>
    expect(batch).toHaveLength(2)
    expect(batch[0]).toMatchObject({
      to: 'ExponentPushToken[validToken12345]',
      title: 'Votz',
      body: 'Você recebeu uma nova mensagem',
      data: { type: 'chat_message', conversationId: 'conv-uuid' },
    })
    expect(devices[0].pushToken).toBe('ExponentPushToken[validToken12345]')
    expect(devices[1].pushToken).toBeNull()
  })
})
