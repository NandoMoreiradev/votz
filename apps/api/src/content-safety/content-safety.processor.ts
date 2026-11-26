import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { FlagSource, FlagStatus, FlagTargetType, ModerationStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ContentSafetyAnalyzer } from './content-safety.analyzer'
import { decideSafetyAction, evaluateTextSync, sanitizeSafetyAnalysis } from './content-safety.policy'

export const CONTENT_SAFETY_QUEUE = 'content-safety'

export interface ContentSafetyReviewJob {
  targetType: 'REPORT' | 'COMMENT' | 'POST' | 'POST_COMMENT'
  targetId: string
  texts: string[]
}

@Processor(CONTENT_SAFETY_QUEUE, { concurrency: 2 })
export class ContentSafetyProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentSafetyProcessor.name)

  constructor(
    private readonly analyzer: ContentSafetyAnalyzer,
    private readonly prisma: PrismaService,
  ) {
    super()
  }

  async process(job: Job<ContentSafetyReviewJob>): Promise<void> {
    if (job.name !== 'review-content') {
      this.logger.warn(`Unknown content-safety job: ${job.name}`)
      return
    }
    await this.review(job.data)
  }

  async review(data: ContentSafetyReviewJob): Promise<{ action: string; flagged: boolean }> {
    const sync = evaluateTextSync(data.texts)

    let ai = null
    if (this.analyzer.isAvailable()) {
      try {
        const raw = await this.analyzer.analyze({ targetType: data.targetType, texts: data.texts })
        ai = sanitizeSafetyAnalysis(raw)
      } catch (err) {
        this.logger.warn(`Triagem IA falhou para ${data.targetType}:${data.targetId}: ${(err as Error)?.message}`)
      }
    }

    const decision = decideSafetyAction(ai, sync)
    if (decision.action === 'ALLOW' || !decision.reason) {
      return { action: 'ALLOW', flagged: false }
    }

    const targetType = data.targetType as FlagTargetType

    // Evita duplicar sinalização automática aberta para o mesmo alvo
    const existing = await this.prisma.contentFlag.findFirst({
      where: {
        targetType,
        targetId: data.targetId,
        source: FlagSource.AUTO_AI,
        status: FlagStatus.OPEN,
      },
      select: { id: true },
    })

    if (!existing) {
      await this.prisma.contentFlag.create({
        data: {
          targetType,
          targetId: data.targetId,
          reason: decision.reason,
          details: decision.details,
          source: FlagSource.AUTO_AI,
          reporterId: null,
        },
      })
    }

    if (targetType === FlagTargetType.REPORT) {
      const nextModerationStatus =
        decision.action === 'QUARANTINE' ? ModerationStatus.HIDDEN : ModerationStatus.UNDER_REVIEW
      await this.prisma.report.updateMany({
        where: { id: data.targetId },
        data: { moderationStatus: nextModerationStatus },
      })
    }

    this.logger.log(
      `[content-safety] ${data.targetType}:${data.targetId} -> ${decision.action} (${decision.topCategory ?? 'other'})`,
    )
    return { action: decision.action, flagged: true }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Content safety job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
