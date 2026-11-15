import { Processor, WorkerHost } from '@nestjs/bullmq'
import { OrgType } from '@prisma/client'
import { Job } from 'bullmq'
import { WEEKLY_DIGEST_QUEUE, WeeklyDigestService } from './weekly-digest.service'

export interface WeeklyDigestJobData {
  orgType: OrgType
  orgId: string
  weekKey: string
  force?: boolean
}

@Processor(WEEKLY_DIGEST_QUEUE)
export class WeeklyDigestProcessor extends WorkerHost {
  constructor(private readonly digest: WeeklyDigestService) {
    super()
  }

  async process(job: Job<WeeklyDigestJobData>) {
    if (job.name === 'send-weekly-digest') {
      return this.digest.processDigestJob(
        job.data.orgType,
        job.data.orgId,
        job.data.weekKey,
        { force: job.data.force },
      )
    }
    return { ignored: true }
  }
}
