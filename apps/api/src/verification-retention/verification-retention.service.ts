import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { Prisma, RegistrationRequestStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'

export const VERIFICATION_RETENTION_QUEUE = 'verification-retention'
const REJECTED_RETENTION_DAYS = 30
const APPROVED_RETENTION_MONTHS = 12
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

@Injectable()
export class VerificationRetentionService {
  private readonly logger = new Logger(VerificationRetentionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(VERIFICATION_RETENTION_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(): Promise<void> {
    await this.queue.add(
      'purge-expired-documents',
      {},
      { jobId: 'verification-retention-daily', removeOnComplete: 10, removeOnFail: 10 },
    )
  }

  async purgeExpiredDocuments(now = new Date()): Promise<{
    scanned: number
    purgedRequests: number
    deletedFiles: number
    failedFiles: number
  }> {
    const rejectedCutoff = subtractDays(now, REJECTED_RETENTION_DAYS)
    const approvedCutoff = subtractMonths(now, APPROVED_RETENTION_MONTHS)

    let scanned = 0
    let purgedRequests = 0
    let deletedFiles = 0
    let failedFiles = 0
    const excludeIds = new Set<string>()

    while (true) {
      const batch = await this.prisma.registrationRequest.findMany({
        where: {
          ...(excludeIds.size > 0 ? { id: { notIn: Array.from(excludeIds) } } : {}),
          OR: [
            { status: RegistrationRequestStatus.REJECTED, updatedAt: { lt: rejectedCutoff } },
            { status: RegistrationRequestStatus.APPROVED, updatedAt: { lt: approvedCutoff } },
          ],
        },
        select: { id: true, status: true, updatedAt: true, payload: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      })

      if (!batch || batch.length === 0) break

      for (const req of batch) {
        excludeIds.add(req.id)
        scanned++
        if (!this.isEligibleForPurge(req.status, req.updatedAt, rejectedCutoff, approvedCutoff)) {
          continue
        }
        const res = await this.purgeRequestDocuments(req.id, req.payload, now)
        if (res.updated) purgedRequests++
        deletedFiles += res.deleted
        failedFiles += res.failed
      }

      if (batch.length < BATCH_SIZE) break
    }

    if (purgedRequests > 0 || failedFiles > 0) {
      this.logger.log(
        `Verification retention run: scanned=${scanned}, updated=${purgedRequests}, deletedFiles=${deletedFiles}, failedFiles=${failedFiles}`,
      )
    }

    return { scanned, purgedRequests, deletedFiles, failedFiles }
  }

  private isEligibleForPurge(
    status: RegistrationRequestStatus | undefined,
    updatedAt: Date | undefined,
    rejectedCutoff: Date,
    approvedCutoff: Date,
  ): boolean {
    if (!status || !updatedAt) return true
    if (status === RegistrationRequestStatus.REJECTED) return updatedAt < rejectedCutoff
    if (status === RegistrationRequestStatus.APPROVED) return updatedAt < approvedCutoff
    return false
  }

  private async purgeRequestDocuments(
    id: string,
    rawPayload: unknown,
    now: Date,
  ): Promise<{ updated: boolean; deleted: number; failed: number }> {
    if (!isPlainObject(rawPayload)) {
      return { updated: false, deleted: 0, failed: 0 }
    }

    const docs = rawPayload['documents']
    if (!isPlainObject(docs)) {
      return { updated: false, deleted: 0, failed: 0 }
    }

    const entries = Object.entries(docs)
    const verificationEntries = entries.filter(
      ([, value]) => typeof value === 'string' && value.startsWith('verification/'),
    )

    if (verificationEntries.length === 0) {
      return { updated: false, deleted: 0, failed: 0 }
    }

    let deleted = 0
    let failed = 0
    const remainingDocs: Record<string, unknown> = {}

    for (const [docName, value] of entries) {
      if (typeof value === 'string' && value.startsWith('verification/')) {
        try {
          await this.storage.delete(value)
          deleted++
        } catch (err: unknown) {
          failed++
          remainingDocs[docName] = value
          const message = err instanceof Error ? err.message : String(err)
          this.logger.warn(
            `Failed to delete verification document "${value}" for request ${id}: ${message}`,
          )
        }
      } else {
        remainingDocs[docName] = value
      }
    }

    if (deleted === 0) {
      return { updated: false, deleted: 0, failed }
    }

    const updatedPayload: Record<string, unknown> = { ...rawPayload }
    if (failed === 0) {
      delete updatedPayload['documents']
      updatedPayload['documentsPurgedAt'] = now.toISOString()
    } else {
      updatedPayload['documents'] = remainingDocs
    }

    await this.prisma.registrationRequest.update({
      where: { id },
      data: { payload: updatedPayload as Prisma.InputJsonValue },
    })

    return { updated: true, deleted, failed }
  }
}
