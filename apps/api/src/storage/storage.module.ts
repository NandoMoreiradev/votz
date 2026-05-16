import { Global, Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { StorageService } from './storage.service'
import { StorageController } from './storage.controller'

@Global()
@Module({
  imports: [
    MulterModule.register({ storage: undefined }), // memoryStorage (buffer em memória)
  ],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
