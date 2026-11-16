import { InjectQueue } from '@nestjs/bullmq'
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  OrgPermission,
  OrgType,
  WebhookDeliveryStatus,
  WebhookEventType,
} from '@prisma/client'
import { OrgPlanType, getPlanConfig } from '@votz/shared-types'
import { Queue } from 'bullmq'
import { randomBytes } from 'crypto'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { recordOrgAudit } from '../common/audit/org-audit'
import { CryptoService } from '../crypto/crypto.service'
import { PrismaService } from '../prisma/prisma.service'
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto'
import { signWebhookPayload } from './hmac'
import { safeWebhookPost, validateWebhookUrl } from './ssrf-guard'

export const WEBHOOKS_QUEUE = 'webhooks'
export const CONSECUTIVE_FAILURE_DISABLE_THRESHOLD = 5
export const WEBHOOK_DELIVERY_ATTEMPTS = 5

const WEBHOOK_EVENT_NAMES: Record<WebhookEventType, string> = {
  [WebhookEventType.REPORT_CREATED]: 'report.created',
  [WebhookEventType.REPORT_STATUS_CHANGED]: 'report.status_changed',
  [WebhookEventType.REPORT_PRESSURE_THRESHOLD]: 'report.pressure_threshold',
  [WebhookEventType.OUTBREAK_DETECTED]: 'outbreak.detected',
  [WebhookEventType.SLA_AT_RISK]: 'sla.at_risk',
  [WebhookEventType.SLA_BREACHED]: 'sla.breached',
  [WebhookEventType.REPORT_ASSIGNED]: 'report.assigned',
}

const FORBIDDEN_WEBHOOK_KEYS = new Set([
  'author',
  'authorId',
  'userId',
  'email',
  'cpf',
  'phone',
  'ip',
  'password',
  'notes',
  'tags',
  'orgNotes',
  'orgTags',
])

export function sanitizeWebhookData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeWebhookData)
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_WEBHOOK_KEYS.has(key)) continue
      out[key] = sanitizeWebhookData(v)
    }
    return out
  }
  return value
}

export interface WebhookDeliveryJob {
  deliveryId: string
  payload: Record<string, unknown>
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @InjectQueue(WEBHOOKS_QUEUE) private readonly queue: Queue,
  ) {}

  private async resolveOrgLimit(orgType: OrgType, orgId: string): Promise<number> {
    if (orgType === OrgType.POLITICIAN) {
      const p = await this.prisma.politician.findUnique({
        where: { id: orgId },
        select: { plan: true },
      })
      const cfg = getPlanConfig('POLITICIAN', p?.plan ?? 'BASICO')
      return cfg?.limits.maxWebhookEndpoints ?? 0
    }
    if (orgType === OrgType.ENTITY) {
      const e = await this.prisma.entity.findUnique({
        where: { id: orgId },
        select: { plan: true },
      })
      const cfg = getPlanConfig('ENTITY', e?.plan ?? 'BASICO')
      return cfg?.limits.maxWebhookEndpoints ?? 0
    }
    const cfg = getPlanConfig(orgType as OrgPlanType, 'BASICO')
    return cfg?.limits.maxWebhookEndpoints ?? 0
  }

  async listEndpoints(user: ActingUser) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.MANAGE_PROFILE,
    )
    const maxEndpoints = await this.resolveOrgLimit(acting.orgType, acting.orgId)
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { orgType: acting.orgType, orgId: acting.orgId },
      select: {
        id: true,
        url: true,
        events: true,
        secretPrefix: true,
        active: true,
        consecutiveFailures: true,
        disabledReason: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return { data: endpoints, limit: maxEndpoints }
  }

  async createEndpoint(user: ActingUser, dto: CreateWebhookDto) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.MANAGE_PROFILE,
    )

    await validateWebhookUrl(dto.url)

    const maxEndpoints = await this.resolveOrgLimit(acting.orgType, acting.orgId)
    const currentCount = await this.prisma.webhookEndpoint.count({
      where: { orgType: acting.orgType, orgId: acting.orgId },
    })
    if (currentCount >= maxEndpoints) {
      throw new ForbiddenException(
        `Limite de ${maxEndpoints} endpoint(s) de webhook atingido para o plano atual.`,
      )
    }

    const rawSecret = `whsec_${randomBytes(24).toString('hex')}`
    const secretPrefix = `${rawSecret.slice(0, 12)}...`
    const secretEncrypted = this.crypto.encrypt(rawSecret)
    const uniqueEvents = Array.from(new Set(dto.events))

    const created = await this.prisma.$transaction(async (tx) => {
      const ep = await tx.webhookEndpoint.create({
        data: {
          orgType: acting.orgType,
          orgId: acting.orgId,
          url: dto.url.trim(),
          events: uniqueEvents,
          secretEncrypted,
          secretPrefix,
          createdById: user.id,
        },
        select: {
          id: true,
          url: true,
          events: true,
          secretPrefix: true,
          active: true,
          consecutiveFailures: true,
          createdAt: true,
        },
      })
      await recordOrgAudit(tx, {
        action: 'CREATED',
        orgType: acting.orgType,
        orgId: acting.orgId,
        itemType: 'WEBHOOK_ENDPOINT',
        itemId: ep.id,
        actorId: user.id,
        summary: `Webhook criado (${ep.url})`,
      })
      return ep
    })

    return { ...created, secret: rawSecret }
  }

  async updateEndpoint(user: ActingUser, id: string, dto: UpdateWebhookDto) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.MANAGE_PROFILE,
    )
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, orgType: acting.orgType, orgId: acting.orgId },
    })
    if (!existing) throw new NotFoundException('Endpoint de webhook não encontrado')

    if (dto.url !== undefined) {
      await validateWebhookUrl(dto.url)
    }

    return this.prisma.webhookEndpoint.update({
      where: { id: existing.id },
      data: {
        ...(dto.url !== undefined ? { url: dto.url.trim() } : {}),
        ...(dto.events !== undefined ? { events: Array.from(new Set(dto.events)) } : {}),
        ...(dto.active !== undefined
          ? {
              active: dto.active,
              consecutiveFailures: dto.active ? 0 : existing.consecutiveFailures,
              disabledReason: dto.active ? null : existing.disabledReason,
            }
          : {}),
      },
      select: {
        id: true,
        url: true,
        events: true,
        secretPrefix: true,
        active: true,
        consecutiveFailures: true,
        disabledReason: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  async deleteEndpoint(user: ActingUser, id: string) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.MANAGE_PROFILE,
    )
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, orgType: acting.orgType, orgId: acting.orgId },
    })
    if (!existing) throw new NotFoundException('Endpoint de webhook não encontrado')

    await this.prisma.$transaction(async (tx) => {
      await tx.webhookEndpoint.delete({ where: { id: existing.id } })
      await recordOrgAudit(tx, {
        action: 'DELETED',
        orgType: acting.orgType,
        orgId: acting.orgId,
        itemType: 'WEBHOOK_ENDPOINT',
        itemId: existing.id,
        actorId: user.id,
        summary: `Webhook removido (${existing.url})`,
      })
    })
    return { deleted: true }
  }

  async listDeliveries(user: ActingUser, endpointId: string) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      OrgPermission.MANAGE_PROFILE,
    )
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, orgType: acting.orgType, orgId: acting.orgId },
      select: { id: true },
    })
    if (!endpoint) throw new NotFoundException('Endpoint de webhook não encontrado')

    return this.prisma.webhookDelivery.findMany({
      where: { endpointId: endpoint.id },
      select: {
        id: true,
        eventId: true,
        eventType: true,
        status: true,
        httpStatus: true,
        latencyMs: true,
        attemptCount: true,
        errorMessage: true,
        createdAt: true,
        deliveredAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  }

  async enqueueEvent(
    orgType: OrgType,
    orgId: string,
    eventType: WebhookEventType,
    eventId: string,
    data: Record<string, unknown>,
  ): Promise<number> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { orgType, orgId, active: true, events: { has: eventType } },
      select: { id: true },
    })
    if (endpoints.length === 0) return 0

    const cleanData = sanitizeWebhookData(data) as Record<string, unknown>
    const payload = {
      eventId,
      eventType,
      event: WEBHOOK_EVENT_NAMES[eventType] ?? eventType,
      occurredAt: new Date().toISOString(),
      data: cleanData,
    }

    let queued = 0
    for (const ep of endpoints) {
      const existing = await this.prisma.webhookDelivery.findUnique({
        where: { endpointId_eventId: { endpointId: ep.id, eventId } },
        select: { id: true },
      })
      if (existing) continue

      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          endpointId: ep.id,
          eventId,
          eventType,
          status: WebhookDeliveryStatus.PENDING,
        },
      })
      await this.queue.add(
        'deliver',
        { deliveryId: delivery.id, payload } satisfies WebhookDeliveryJob,
        {
          jobId: `webhook:${delivery.id}`,
          attempts: WEBHOOK_DELIVERY_ATTEMPTS,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      )
      queued++
    }
    return queued
  }

  async processDelivery(
    jobData: WebhookDeliveryJob,
    attemptNumber: number,
    maxAttempts: number,
  ): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: jobData.deliveryId },
      include: { endpoint: true },
    })
    if (!delivery || !delivery.endpoint.active) return

    const rawBody = JSON.stringify(sanitizeWebhookData(jobData.payload))
    const secret = this.crypto.decrypt(delivery.endpoint.secretEncrypted)
    const timestampSec = Math.floor(Date.now() / 1000)
    const signature = signWebhookPayload(secret, timestampSec, rawBody)

    const startMs = Date.now()
    try {
      const res = await safeWebhookPost(
        delivery.endpoint.url,
        {
          'Content-Type': 'application/json',
          'User-Agent': 'Votz-Webhooks/1.0',
          'X-Votz-Event-Id': delivery.eventId,
          'X-Votz-Event-Type': delivery.eventType,
          'X-Votz-Timestamp': String(timestampSec),
          'X-Votz-Signature': signature,
        },
        rawBody,
      )
      const latencyMs = Date.now() - startMs

      if (res.statusCode >= 200 && res.statusCode < 300) {
        await this.prisma.$transaction([
          this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: WebhookDeliveryStatus.SUCCESS,
              httpStatus: res.statusCode,
              latencyMs,
              attemptCount: attemptNumber,
              errorMessage: null,
              deliveredAt: new Date(),
            },
          }),
          this.prisma.webhookEndpoint.update({
            where: { id: delivery.endpointId },
            data: { consecutiveFailures: 0, disabledReason: null },
          }),
        ])
        return
      }

      throw new Error(`HTTP ${res.statusCode}`)
    } catch (err) {
      const latencyMs = Date.now() - startMs
      const message = err instanceof Error ? err.message : String(err)
      const isFinalAttempt = attemptNumber >= maxAttempts

      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: isFinalAttempt ? WebhookDeliveryStatus.FAILED : WebhookDeliveryStatus.PENDING,
          latencyMs,
          attemptCount: attemptNumber,
          errorMessage: message.slice(0, 300),
        },
      })

      if (isFinalAttempt) {
        const nextFailures = delivery.endpoint.consecutiveFailures + 1
        const shouldDisable = nextFailures >= CONSECUTIVE_FAILURE_DISABLE_THRESHOLD
        await this.prisma.webhookEndpoint.update({
          where: { id: delivery.endpointId },
          data: {
            consecutiveFailures: nextFailures,
            ...(shouldDisable
              ? {
                  active: false,
                  disabledReason: `Desativado automaticamente após ${nextFailures} falhas seguidas (${message.slice(0, 120)})`,
                }
              : {}),
          },
        })
        this.logger.warn(
          `Webhook endpoint ${delivery.endpointId} failed delivery ${delivery.id} (consecutive=${nextFailures}, disabled=${shouldDisable})`,
        )
      }

      throw err
    }
  }
}
