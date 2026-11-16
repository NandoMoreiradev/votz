import { EventEmitter } from 'events'
import * as https from 'https'
import { OrgType, WebhookDeliveryStatus, WebhookEventType } from '@prisma/client'
import { signWebhookPayload, verifyWebhookSignature } from './hmac'
import {
  isPrivateOrReservedIp,
  safeWebhookPost,
  validateWebhookUrl,
} from './ssrf-guard'
import {
  CONSECUTIVE_FAILURE_DISABLE_THRESHOLD,
  WebhooksService,
  sanitizeWebhookData,
} from './webhooks.service'

describe('Webhook SSRF Guard & Security', () => {
  it('blocks private, loopback, link-local, metadata, IPv6 mapped, NAT64, 6to4, Teredo and ::/96 IPs', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true)
    expect(isPrivateOrReservedIp('172.16.4.10')).toBe(true)
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true)
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true)
    expect(isPrivateOrReservedIp('::1')).toBe(true)
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true)
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true)

    // C3: NAT64 (64:ff9b::/96), 6to4 (2002::/16), IPv4-compatible (::/96), Teredo (2001::/32)
    expect(isPrivateOrReservedIp('[64:ff9b::7f00:1]')).toBe(true)
    expect(isPrivateOrReservedIp('64:ff9b::169.254.169.254')).toBe(true)
    expect(isPrivateOrReservedIp('64:ff9b::0808:0808')).toBe(false)
    expect(isPrivateOrReservedIp('[2002:7f00:1::]')).toBe(true)
    expect(isPrivateOrReservedIp('2002:a9fe:a9fe::')).toBe(true)
    expect(isPrivateOrReservedIp('2002:0808:0808::')).toBe(false)
    expect(isPrivateOrReservedIp('[::127.0.0.1]')).toBe(true)
    expect(isPrivateOrReservedIp('2001::1')).toBe(true)
    expect(isPrivateOrReservedIp('2001:0:53aa:64c:0:0:0:1')).toBe(true)

    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false)
    expect(isPrivateOrReservedIp('104.18.2.3')).toBe(false)
  })

  it('rejects non-HTTPS, credentials in URL, localhost, internal suffixes, and DNS rebinding to private IP', async () => {
    await expect(
      validateWebhookUrl('http://hooks.example.com/votz', async () => [
        { address: '93.184.216.34', family: 4 },
      ]),
    ).rejects.toThrow()

    await expect(
      validateWebhookUrl('https://user:pass@hooks.example.com/votz', async () => [
        { address: '93.184.216.34', family: 4 },
      ]),
    ).rejects.toThrow()

    await expect(
      validateWebhookUrl('https://localhost/webhook'),
    ).rejects.toThrow()

    await expect(
      validateWebhookUrl('https://metadata.internal/latest'),
    ).rejects.toThrow()

    await expect(
      validateWebhookUrl('https://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow()

    // Simula DNS rebinding / resolução para IP privado
    await expect(
      validateWebhookUrl('https://rebind.attacker.test/hook', async () => [
        { address: '127.0.0.1', family: 4 },
      ]),
    ).rejects.toThrow(/SSRF/i)

    const valid = await validateWebhookUrl('https://hooks.parceiro.gov.br/v1', async () => [
      { address: '93.184.216.34', family: 4 },
    ])
    expect(valid.pinnedIp).toBe('93.184.216.34')
    expect(valid.family).toBe(4)
  })

  it('rejects HTTP redirects (3xx) and enforces timeout on safeWebhookPost', async () => {
    const mockTransport = {
      request: jest.fn((_opts: unknown, cb: (res: EventEmitter & { statusCode?: number; headers?: Record<string, string> }) => void) => {
        const req = new EventEmitter() as EventEmitter & {
          write: jest.Mock
          end: jest.Mock
          destroy: jest.Mock
        }
        req.write = jest.fn()
        req.destroy = jest.fn()
        req.end = jest.fn(() => {
          const res = new EventEmitter() as EventEmitter & {
            statusCode?: number
            headers?: Record<string, string>
            resume: jest.Mock
          }
          res.statusCode = 302
          res.headers = { location: 'http://169.254.169.254/latest' }
          res.resume = jest.fn()
          cb(res)
          res.emit('end')
        })
        return req
      }),
    } as unknown as typeof https

    await expect(
      safeWebhookPost(
        'https://hooks.parceiro.gov.br/v1',
        { 'Content-Type': 'application/json' },
        '{"ok":true}',
        {
          lookupFn: async () => [{ address: '93.184.216.34', family: 4 }],
          transport: mockTransport,
        },
      ),
    ).rejects.toThrow(/redirect/i)
  })
})

describe('Webhook HMAC-SHA256 Signing & Replay Protection', () => {
  it('verifies valid signature and rejects tampered payload or expired timestamps', () => {
    const secret = 'whsec_test_secret_123'
    const nowSec = 1_750_000_000
    const body = JSON.stringify({ eventId: 'evt-1', data: { reportId: 'r-1' } })
    const header = signWebhookPayload(secret, nowSec, body)

    expect(verifyWebhookSignature(secret, header, body, nowSec + 10, 300)).toBe(true)
    expect(verifyWebhookSignature(secret, header, `${body} `, nowSec + 10, 300)).toBe(false)
    expect(verifyWebhookSignature(secret, header, body, nowSec + 601, 300)).toBe(false)
    expect(verifyWebhookSignature('wrong-secret', header, body, nowSec + 10, 300)).toBe(false)
  })
})

describe('WebhooksService PII Stripping, Idempotency & Failure Disabling', () => {
  it('strips citizen PII and internal team notes/tags from webhook payloads', () => {
    const cleaned = sanitizeWebhookData({
      reportId: 'rep-1',
      status: 'IN_PROGRESS',
      authorId: 'user-secret',
      author: { name: 'Maria', email: 'maria@example.com', cpf: '00000000000' },
      orgNotes: [{ content: 'Nota interna confidencial' }],
      nested: { phone: '11999999999', ip: '1.2.3.4', category: 'HEALTH' },
    }) as Record<string, unknown>

    expect(cleaned.reportId).toBe('rep-1')
    expect(cleaned.status).toBe('IN_PROGRESS')
    expect(cleaned.authorId).toBeUndefined()
    expect(cleaned.author).toBeUndefined()
    expect(cleaned.orgNotes).toBeUndefined()
    expect(cleaned.nested).toEqual({ category: 'HEALTH' })

    const anonCleaned = sanitizeWebhookData({
      reportId: 'rep-anon-1',
      anonymous: true,
      authorId: null,
      author: null,
      title: 'Buraco na via pública',
      orgNotes: [{ content: 'Nota interna confidencial da assessoria' }],
      orgTags: ['URGENTE_INTERNO'],
    }) as Record<string, unknown>
    expect(anonCleaned.reportId).toBe('rep-anon-1')
    expect(anonCleaned.title).toBe('Buraco na via pública')
    expect(anonCleaned.authorId).toBeUndefined()
    expect(anonCleaned.author).toBeUndefined()
    expect(anonCleaned.orgNotes).toBeUndefined()
    expect(anonCleaned.orgTags).toBeUndefined()
  })

  it('deduplicates enqueueEvent by (endpointId, eventId) and disables endpoint after threshold consecutive failures', async () => {
    const deliveries = new Map<string, { id: string; status: WebhookDeliveryStatus }>()
    let consecutiveFailures = CONSECUTIVE_FAILURE_DISABLE_THRESHOLD - 1
    let endpointActive = true
    let disabledReason: string | null = null

    const prisma = {
      webhookEndpoint: {
        findMany: jest.fn(async () => [{ id: 'ep-1' }]),
        update: jest.fn(async ({ data }: { data: { consecutiveFailures?: number; active?: boolean; disabledReason?: string } }) => {
          if (data.consecutiveFailures !== undefined) consecutiveFailures = data.consecutiveFailures
          if (data.active !== undefined) endpointActive = data.active
          if (data.disabledReason !== undefined) disabledReason = data.disabledReason
          return {}
        }),
      },
      webhookDelivery: {
        findUnique: jest.fn(async ({ where }: { where: { endpointId_eventId?: { endpointId: string; eventId: string }; id?: string } }) => {
          if (where.endpointId_eventId) {
            return deliveries.get(`${where.endpointId_eventId.endpointId}:${where.endpointId_eventId.eventId}`) ?? null
          }
          if (where.id === 'del-1') {
            return {
              id: 'del-1',
              endpointId: 'ep-1',
              attemptCount: 0,
              endpoint: {
                id: 'ep-1',
                url: 'https://localhost/blocked',
                active: endpointActive,
                secretEncrypted: 'enc',
                consecutiveFailures,
              },
            }
          }
          return null
        }),
        create: jest.fn(async ({ data }: { data: { endpointId: string; eventId: string } }) => {
          const row = { id: 'del-1', status: WebhookDeliveryStatus.PENDING }
          deliveries.set(`${data.endpointId}:${data.eventId}`, row)
          return row
        }),
        update: jest.fn(async () => ({})),
      },
    } as any

    const crypto = {
      decrypt: jest.fn(() => 'whsec_secret'),
      encrypt: jest.fn((v: string) => v),
    } as any
    const queue = { add: jest.fn(async () => ({})) } as any

    const svc = new WebhooksService(prisma, crypto, queue)

    const first = await svc.enqueueEvent(
      OrgType.POLITICIAN,
      'pol-1',
      WebhookEventType.REPORT_CREATED,
      'evt-123',
      { reportId: 'r-1', authorId: 'secret-user' },
    )
    const second = await svc.enqueueEvent(
      OrgType.POLITICIAN,
      'pol-1',
      WebhookEventType.REPORT_CREATED,
      'evt-123',
      { reportId: 'r-1' },
    )
    expect(first).toBe(1)
    expect(second).toBe(0)
    expect(queue.add).toHaveBeenCalledTimes(1)

    // Simula 5a falha consecutiva bloqueada pelo SSRF guard (localhost)
    await expect(
      svc.processDelivery(
        { deliveryId: 'del-1', payload: { eventId: 'evt-123' } },
        5,
        5,
      ),
    ).rejects.toThrow()
    expect(consecutiveFailures).toBe(CONSECUTIVE_FAILURE_DISABLE_THRESHOLD)
    expect(endpointActive).toBe(false)
    expect(disabledReason).toBeTruthy()
  })
})
