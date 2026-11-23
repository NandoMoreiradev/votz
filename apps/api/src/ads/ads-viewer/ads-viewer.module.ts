import { Module } from '@nestjs/common'
import { AdsViewerCacheService } from './ads-viewer-cache.service'

/** Cópia curta do cadastro da pessoa para a entrega de anúncios. Quem grava cadastro ou aceite importa este módulo para invalidar. */
@Module({
  providers: [AdsViewerCacheService],
  exports: [AdsViewerCacheService],
})
export class AdsViewerModule {}
