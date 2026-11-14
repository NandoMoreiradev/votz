import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { MailService } from '../mail/mail.service'
import { CryptoService } from '../crypto/crypto.service'

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
    private readonly crypto: CryptoService,
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

    const [
      user,
      reports,
      comments,
      votes,
      notifications,
      memberships,
      timelineEvents,
      debateMessages,
      debateQuestions,
      debatePollVotes,
      propostaVotos,
      politicianFollows,
      apiKeys,
      registrationRequests,
      accessLogs,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, name: true, email: true, type: true, verified: true,
          bio: true, phone: true, cpf: true,
          zipCode: true, street: true, streetNumber: true,
          complement: true, neighborhood: true, city: true, state: true,
          country: true, latitude: true, longitude: true,
          emailVerified: true, mfaEnabled: true,
          termsAcceptedAt: true, termsVersion: true, privacyVersion: true, ageConfirmedAt: true,
          lastLoginAt: true, createdAt: true,
        },
      }),
      this.prisma.report.findMany({
        where: { authorId: userId },
        select: {
          id: true, title: true, description: true, category: true, status: true, anonymous: true,
          normalizedAddress: true, neighborhood: true, city: true, state: true, latitude: true, longitude: true,
          pressureScore: true, createdAt: true,
          _count: { select: { votes: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.comment.findMany({
        where: { authorId: userId },
        select: {
          id: true, content: true, mediaType: true, transcript: true, createdAt: true,
          report: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vote.findMany({
        where: { userId },
        select: { type: true, createdAt: true, report: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.findMany({
        where: { userId },
        select: { type: true, read: true, createdAt: true, report: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.orgMembership.findMany({
        where: { userId },
        select: { orgType: true, orgId: true, status: true, createdAt: true, role: { select: { name: true } } },
      }),
      this.prisma.timelineEvent.findMany({
        where: { authorId: userId },
        select: {
          id: true, type: true, content: true, createdAt: true,
          report: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.debateMessage.findMany({
        where: { authorId: userId },
        select: {
          id: true, text: true, createdAt: true,
          debate: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.debateQuestion.findMany({
        where: { authorId: userId },
        select: {
          id: true, text: true, upvotes: true, answered: true, createdAt: true,
          debate: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.debatePollVote.findMany({
        where: { userId },
        select: {
          id: true,
          poll: { select: { id: true, question: true, debateId: true } },
          option: { select: { id: true, text: true } },
        },
      }),
      this.prisma.propostaVoto.findMany({
        where: { usuarioId: userId },
        select: {
          id: true, apoio: true, createdAt: true,
          proposta: { select: { id: true, titulo: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userPoliticianFollower.findMany({
        where: { userId },
        select: {
          createdAt: true,
          politician: { select: { id: true, name: true, office: true, state: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.apiKey.findMany({
        where: { userId },
        select: { name: true, prefix: true, tier: true, lastUsedAt: true, revokedAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.registrationRequest.findMany({
        where: { requesterId: userId },
        select: { type: true, status: true, createdAt: true, reviewNote: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.accessLog.findMany({
        where: { userId },
        select: { event: true, ip: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    let decryptedCpf: string | null = null
    if (user?.cpf) {
      try {
        decryptedCpf = this.crypto.decrypt(user.cpf)
      } catch {
        decryptedCpf = null
      }
    }

    const profile = user ? { ...user, cpf: decryptedCpf } : null

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile,
      reports: { total: reports.length, items: reports },
      comments: { total: comments.length, items: comments },
      votes: { total: votes.length, items: votes },
      notifications: { total: notifications.length, items: notifications },
      memberships,
      timelineEvents: { total: timelineEvents.length, items: timelineEvents },
      debateMessages: { total: debateMessages.length, items: debateMessages },
      debateQuestions: { total: debateQuestions.length, items: debateQuestions },
      debatePollVotes: { total: debatePollVotes.length, items: debatePollVotes },
      propostaVotos: { total: propostaVotos.length, items: propostaVotos },
      politicianFollows: { total: politicianFollows.length, items: politicianFollows },
      apiKeys: { total: apiKeys.length, items: apiKeys },
      registrationRequests: { total: registrationRequests.length, items: registrationRequests },
      accessLogs: { total: accessLogs.length, items: accessLogs },
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
