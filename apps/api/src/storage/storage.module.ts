import { Global, Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { StorageService } from './storage.service'
import { StorageController } from './storage.controller'
import { ReportMediaService } from './report-media.service'
import { BullModule } from '@nestjs/bullmq'
import { MEDIA_QUEUE, MediaProcessingProcessor, MediaProcessingService } from './media-processing'
import { DirectUploadService } from './direct-upload.service'

@Global()
@Module({
  imports: [
    MulterModule.register({ storage: undefined }), // memoryStorage (buffer em memória)
    BullModule.registerQueue({ name: MEDIA_QUEUE }),
  ],
  controllers: [StorageController],
  providers: [StorageService, ReportMediaService, MediaProcessingService, MediaProcessingProcessor, DirectUploadService],
  exports: [StorageService, ReportMediaService, MediaProcessingService],
})
export class StorageModule {}
