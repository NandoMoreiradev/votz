import { Controller, Post, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { UserType } from '@votz/shared-types'
import { CamaraSyncService, CAMARA_SYNC_QUEUE } from './camara-sync.service'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

@ApiTags('camara-sync')
@Controller('camara-sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.ADMIN)
@ApiBearerAuth()
export class CamaraSyncController {
  constructor(
    private readonly service: CamaraSyncService,
    @InjectQueue(CAMARA_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '[Admin] Dispara sync manual da Câmara dos Deputados' })
  trigger() {
    return this.service.triggerSync()
  }

  @Get('status')
  @ApiOperation({ summary: '[Admin] Retorna status da fila de sync' })
  async status() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ])
    return { waiting, active, completed, failed }
  }
}
