import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { NotificationsModule } from '../../notifications/notifications.module'
import { AdsReviewRepository } from './ads-review.repository'
import { AdsReviewService } from './ads-review.service'

/** Serviço de revisão de anúncios. A rota fica no módulo de moderação (`/admin/ad-reviews`). */
@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [AdsReviewService, AdsReviewRepository],
  exports: [AdsReviewService],
})
export class AdsReviewModule {}
