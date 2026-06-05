import { Logger, Optional } from '@nestjs/common'
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { DEBATES_QUEUE, DebateJob } from './debates.service'
import { DebatesRepository } from './debates.repository'
import { NotificationsGateway } from '../notifications/notifications.gateway'

@Processor(DEBATES_QUEUE, { concurrency: 5 })
export class DebatesProcessor extends WorkerHost {
  private readonly logger = new Logger(DebatesProcessor.name)

  constructor(
    private readonly repo: DebatesRepository,
    @Optional() private readonly notificationsGateway: NotificationsGateway,
  ) {
    super()
  }

  async process(job: Job<DebateJob>): Promise<void> {
    const { type } = job.data

    switch (type) {
      case 'debate:live':
        await this.fanOutGoLive(job.data)
        return

      case 'debate:recording-done':
        await this.handleRecordingDone(job.data)
        return

      default:
        this.logger.warn(`Unknown job type: ${type}`)
    }
  }

  private async fanOutGoLive(data: Extract<DebateJob, { type: 'debate:live' }>) {
    const { debateId, title, participantIds } = data

    const followers = await this.repo.getFollowersOfPoliticians(participantIds)
    const uniqueUserIds = [...new Set(followers.map((f) => f.userId))]

    const payload = { debateId, title, participantCount: participantIds.length }
    const CHUNK_SIZE = 100

    for (let i = 0; i < uniqueUserIds.length; i += CHUNK_SIZE) {
      const chunk = uniqueUserIds.slice(i, i + CHUNK_SIZE)
      await Promise.allSettled(
        chunk.map((userId) =>
          Promise.resolve(this.notificationsGateway?.emitToUser(userId, 'debate:live', payload)),
        ),
      )
    }

    this.logger.log(`Fan-out: notified ${uniqueUserIds.length} followers of debate ${debateId}`)
  }

  private async handleRecordingDone(data: Extract<DebateJob, { type: 'debate:recording-done' }>) {
    const { debateId } = data
    this.logger.log(`Recording done for debate ${debateId} — update recordingUrl when S3 path is available`)
    // Future: poll S3 / use LiveKit webhook to get the actual recording URL and update debate.recordingUrl
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
