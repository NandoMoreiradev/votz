import { Controller, Post, Get, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
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
  @ApiQuery({ name: 'legislatura', required: false, type: Number, description: 'ID da legislatura (ex: 58)' })
  @ApiOperation({ summary: '[Admin] Dispara sync manual da Câmara dos Deputados' })
  trigger(@Query('legislatura') legRaw?: string) {
    const leg = legRaw ? Number(legRaw) : undefined
    return this.service.triggerSync(leg && !Number.isNaN(leg) ? leg : undefined)
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
