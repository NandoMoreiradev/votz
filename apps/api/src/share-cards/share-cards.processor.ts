import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { ShareCardFormat } from '@prisma/client'
import { Job } from 'bullmq'
import { SHARE_CARDS_QUEUE, ShareCardsService } from './share-cards.service'

export interface ShareCardsJobPayload {
  politicianId: string
  format?: ShareCardFormat
  from?: string
  to?: string
}

@Processor(SHARE_CARDS_QUEUE)
export class ShareCardsProcessor extends WorkerHost {
  private readonly logger = new Logger(ShareCardsProcessor.name)

  constructor(private readonly shareCards: ShareCardsService) {
    super()
  }

  async process(job: Job<ShareCardsJobPayload>) {
    if (job.name === 'refresh-politician-cards') {
      await this.shareCards.refreshRecentCardsForPolitician(job.data.politicianId)
      return { refreshed: true }
    }

    if (job.name === 'render-share-card' && job.data.from && job.data.to) {
      await this.shareCards.renderOrFetchPublicImage(
        job.data.politicianId,
        job.data.format ?? ShareCardFormat.FEED,
        job.data.from,
        job.data.to,
      )
      return { rendered: true }
    }

    this.logger.debug(`Job desconhecido em ${SHARE_CARDS_QUEUE}: ${job.name}`)
    return { ignored: true }
  }
}
