import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { MailService } from '../mail/mail.service'

export const LGPD_QUEUE = 'lgpd'

export interface LgpdExportJob {
  userId: string
  email: string
  name: string
}

@Processor(LGPD_QUEUE, { concurrency: 2 })
export class LgpdProcessor extends WorkerHost {
  private readonly logger = new Logger(LgpdProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {
    super()
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'export-data') {
      this.logger.warn(`Unknown LGPD job: ${job.name}`)
      return
    }

    const { userId, email, name } = job.data as LgpdExportJob

    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!exists) {
      this.logger.warn(`Export job skipped — user ${userId} no longer exists`)
      return
    }

    const [user, reports, comments, votes, notifications, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, name: true, email: true, type: true, verified: true,
          bio: true, phone: true, zipCode: true, street: true, streetNumber: true,
          complement: true, neighborhood: true, city: true, state: true,
          country: true, latitude: true, longitude: true,
          emailVerified: true, mfaEnabled: true, createdAt: true,
        },
      }),
      this.prisma.report.findMany({
        where: { authorId: userId, anonymous: false },
        select: {
          id: true, title: true, description: true, category: true, status: true,
          city: true, state: true, latitude: true, longitude: true,
          pressureScore: true, createdAt: true,
          _count: { select: { votes: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.comment.findMany({
        where: { authorId: userId },
        select: { id: true, content: true, createdAt: true, report: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.vote.findMany({
        where: { userId },
        select: { type: true, createdAt: true, report: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      this.prisma.notification.findMany({
        where: { userId },
        select: { type: true, read: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.orgMembership.findMany({
        where: { userId },
        select: { orgType: true, orgId: true, role: true, createdAt: true },
      }),
    ])

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: user,
      reports: { total: reports.length, items: reports },
      comments: { total: comments.length, items: comments },
      votes: { total: votes.length, items: votes },
      notifications: { total: notifications.length, items: notifications },
      memberships,
    }

    const key = `exports/${userId}/${randomUUID()}.json`
    await this.storage.uploadJson(key, exportData)

    const downloadUrl = await this.storage.getSignedDownloadUrl(key, 86400)
    await this.mail.sendDataExportReady(email, name, downloadUrl)

    this.logger.log(`Data export for user ${userId} ready`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`LGPD job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
