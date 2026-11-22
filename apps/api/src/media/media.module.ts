import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { MulterModule } from '@nestjs/platform-express'
import { MEDIA_RENDER_QUEUE, MediaAssetsService } from './media-assets.service'
import { MediaController } from './media.controller'
import { MediaRenderProcessor } from './media-render.processor'

/** Padrão de fotos e vídeos das publicações (docs/dev/padrao-de-midia-plano-2026-11-21.md). */
@Module({
  imports: [
    MulterModule.register({ storage: undefined }), // memoryStorage (buffer em memória)
    BullModule.registerQueue({ name: MEDIA_RENDER_QUEUE }),
  ],
  controllers: [MediaController],
  providers: [MediaAssetsService, MediaRenderProcessor],
  exports: [MediaAssetsService],
})
export class MediaModule {}
