import { Controller, Post, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { UserType } from '@votz/shared-types'
import { IbgeSyncService, IBGE_SYNC_QUEUE } from './ibge-sync.service'

@ApiTags('ibge-sync')
@Controller('ibge-sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.ADMIN)
@ApiBearerAuth()
export class IbgeSyncController {
  constructor(
    private readonly service: IbgeSyncService,
    @InjectQueue(IBGE_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '[Admin] Dispara sync manual de municípios do IBGE' })
  trigger() {
    return this.service.triggerSync()
  }

  @Get('status')
  @ApiOperation({ summary: '[Admin] Retorna status da fila de sync IBGE' })
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
