import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { YoutubeApiService } from './youtube-api.service'
import { YoutubeChannelsRepository } from './youtube-channels.repository'
import { YoutubeChannelsService } from './youtube-channels.service'
import { YoutubeController } from './youtube.controller'

@Module({
  imports: [PrismaModule],
  controllers: [YoutubeController],
  providers: [YoutubeApiService, YoutubeChannelsRepository, YoutubeChannelsService],
  exports: [YoutubeChannelsService],
})
export class YoutubeModule {}
