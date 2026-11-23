import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { AdsVolumeService } from './ads-volume.service'

@Module({
  imports: [PrismaModule],
  providers: [AdsVolumeService],
  exports: [AdsVolumeService],
})
export class AdsVolumeModule {}
