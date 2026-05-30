import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

export const TRANSCRIPTION_QUEUE = 'transcription'

export interface TranscriptionJob {
  commentId: string
  mediaKey: string
}

@Injectable()
export class TranscriptionService {
  constructor(
    @InjectQueue(TRANSCRIPTION_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(job: TranscriptionJob) {
    return this.queue.add('transcribe', job, {
      jobId: `transcribe:${job.commentId}`,
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    })
  }
}
