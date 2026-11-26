import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Job } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'

export const NOTIFICATIONS_PUSH_QUEUE = 'notifications-push'

export interface NotificationPushJobData {
  userIds: string[]
  title: string
  body: string
  data: Record<string, string>
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

@Processor(NOTIFICATIONS_PUSH_QUEUE)
export class NotificationsPushProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsPushProcessor.name)

  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {
    super()
  }

  async process(job: Job<NotificationPushJobData>): Promise<{ sent: number; cleaned: number }> {
    const enabled =
      this.config.get('NOTIFICATIONS_PUSH_ENABLED') === 'true' ||
      this.config.get('CHAT_PUSH_ENABLED') === 'true'
    if (!enabled) return { sent: 0, cleaned: 0 }

    const { userIds, title, body, data } = job.data
    if (!userIds?.length) return { sent: 0, cleaned: 0 }

    const uniqueUserIds = Array.from(new Set(userIds))
    const devices = await this.db.chatDevice.findMany({
      where: {
        userId: { in: uniqueUserIds },
        revokedAt: null,
        pushToken: { not: null },
      },
      select: { id: true, pushToken: true },
    })
    if (!devices.length) return { sent: 0, cleaned: 0 }

    const valid = devices.filter(
      (d): d is { id: string; pushToken: string } =>
        typeof d.pushToken === 'string' && d.pushToken.length > 0,
    )

    let sent = 0
    let cleaned = 0

    for (let offset = 0; offset < valid.length; offset += 100) {
      const batch = valid.slice(offset, offset + 100)
      const messages = batch.map((device) => ({
        to: device.pushToken,
        title,
        body,
        sound: 'default',
        channelId: 'votz-notifications',
        priority: 'default',
        data,
      }))

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        this.logger.warn(`Expo Push HTTP ${response.status}`)
        throw new Error(`Expo Push HTTP ${response.status}`)
      }

      const payload = (await response.json().catch(() => ({}))) as {
        data?: Array<{
          status?: string
          details?: { error?: string }
        }>
      }
      sent += batch.length

      const staleIds: string[] = []
      const tickets = Array.isArray(payload.data) ? payload.data : []
      for (let i = 0; i < tickets.length && i < batch.length; i++) {
        if (
          tickets[i]?.status === 'error' &&
          tickets[i]?.details?.error === 'DeviceNotRegistered'
        ) {
          staleIds.push(batch[i].id)
        }
      }
      if (staleIds.length) {
        await this.db.chatDevice.updateMany({
          where: { id: { in: staleIds } },
          data: { pushToken: null, pushTokenUpdatedAt: null },
        })
        cleaned += staleIds.length
      }
    }

    return { sent, cleaned }
  }
}
