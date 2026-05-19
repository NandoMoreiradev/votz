import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { PrismaModule } from '../prisma/prisma.module'
import { REDIS_CLIENT } from './public-api.constants'
import { ApiKeysService } from './api-keys.service'
import { ApiKeysController } from './api-keys.controller'
import { PublicApiRepository } from './public-api.repository'
import { PublicApiService } from './public-api.service'
import { PublicApiController } from './public-api.controller'
import { ApiKeyGuard } from './guards/api-key.guard'

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'
        return new Redis(url, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: false,
          lazyConnect: false,
        })
      },
    },
    ApiKeysService,
    ApiKeyGuard,
    PublicApiRepository,
    PublicApiService,
  ],
  controllers: [ApiKeysController, PublicApiController],
  exports: [ApiKeysService],
})
export class PublicApiModule {}
