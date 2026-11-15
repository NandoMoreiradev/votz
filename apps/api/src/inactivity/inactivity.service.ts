import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { MembershipStatus, UserType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { UsersService } from '../users/users.service'

export const INACTIVITY_QUEUE = 'inactivity'
export const INACTIVITY_MONTHS = 24
export const INACTIVITY_GRACE_DAYS = 30
const BATCH_SIZE = 100

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000)
}

function subtractMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const originalDay = result.getUTCDate()
  result.setUTCMonth(result.getUTCMonth() - months)
  if (result.getUTCDate() !== originalDay) {
    result.setUTCDate(0)
  }
  return result
}

@Injectable()
export class InactivityService {
  private readonly logger = new Logger(InactivityService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly usersService: UsersService,
    @InjectQueue(INACTIVITY_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(): Promise<void> {
    await this.queue.add(
      'process-inactivity',
      {},
      { jobId: 'inactivity:daily', removeOnComplete: 10, removeOnFail: 10 },
    )
  }

  async processInactivity(now = new Date()): Promise<{ notified: number; anonymized: number }> {
    const anonymized = await this.anonymizeInactiveUsers(now)
    const notified = await this.sendInactivityNotices(now)
    return { notified, anonymized }
  }

  async sendInactivityNotices(now = new Date()): Promise<number> {
    const inactiveCutoff = subtractMonths(now, INACTIVITY_MONTHS)
    let notified = 0
    const excludeIds = new Set<string>()

    while (true) {
      const batch = await this.prisma.user.findMany({
        where: {
          ...(excludeIds.size > 0 ? { id: { notIn: Array.from(excludeIds) } } : {}),
          type: UserType.CITIZEN,
          banned: false,
          inactivityNoticeSentAt: null,
          memberships: { none: { status: MembershipStatus.ACTIVE } },
          OR: [
            { lastLoginAt: { lt: inactiveCutoff } },
            { lastLoginAt: null, createdAt: { lt: inactiveCutoff } },
          ],
        },
        select: {
          id: true,
          email: true,
          name: true,
          type: true,
          banned: true,
          lastLoginAt: true,
          createdAt: true,
          inactivityNoticeSentAt: true,
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      })

      if (!batch || batch.length === 0) break

      for (const user of batch) {
        excludeIds.add(user.id)
        if (user.type !== UserType.CITIZEN || user.banned) continue
        if (user.inactivityNoticeSentAt != null) continue
        const lastActivity = user.lastLoginAt ?? user.createdAt
        if (lastActivity && lastActivity >= inactiveCutoff) continue

        try {
          await this.mail.sendInactivityNotice(user.email, user.name)
          await this.prisma.user.update({
            where: { id: user.id },
            data: { inactivityNoticeSentAt: now },
          })
          notified++
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          this.logger.warn(`Failed to send inactivity notice for user ${user.id}: ${message}`)
        }
      }

      if (batch.length < BATCH_SIZE) break
    }

    if (notified > 0) {
      this.logger.log(`Sent ${notified} inactivity notices`)
    }

    return notified
  }

  async anonymizeInactiveUsers(now = new Date()): Promise<number> {
    const noticeCutoff = subtractDays(now, INACTIVITY_GRACE_DAYS)
    let anonymized = 0
    const excludeIds = new Set<string>()

    while (true) {
      const batch = await this.prisma.user.findMany({
        where: {
          ...(excludeIds.size > 0 ? { id: { notIn: Array.from(excludeIds) } } : {}),
          type: UserType.CITIZEN,
          banned: false,
          inactivityNoticeSentAt: { not: null, lt: noticeCutoff },
          memberships: { none: { status: MembershipStatus.ACTIVE } },
        },
        select: {
          id: true,
          type: true,
          banned: true,
          lastLoginAt: true,
          inactivityNoticeSentAt: true,
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      })

      if (!batch || batch.length === 0) break

      for (const user of batch) {
        excludeIds.add(user.id)
        if (user.type !== UserType.CITIZEN || user.banned) continue
        if (!user.inactivityNoticeSentAt || user.inactivityNoticeSentAt >= noticeCutoff) continue

        if (user.lastLoginAt && user.lastLoginAt >= user.inactivityNoticeSentAt) {
          await this.prisma.user
            .update({
              where: { id: user.id },
              data: { inactivityNoticeSentAt: null },
            })
            .catch(() => null)
          continue
        }

        try {
          await this.usersService.eraseUserData(user.id)
          anonymized++
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          this.logger.warn(`Failed to anonymize inactive user ${user.id}: ${message}`)
        }
      }

      if (batch.length < BATCH_SIZE) break
    }

    if (anonymized > 0) {
      this.logger.log(`Anonymized ${anonymized} inactive users`)
    }

    return anonymized
  }
}
