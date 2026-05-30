import { Controller, Post, Get, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { UserType } from '@votz/shared-types'
import { TseSyncService, TSE_SYNC_QUEUE } from './tse-sync.service'

@ApiTags('tse-sync')
@Controller('tse-sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.ADMIN)
@ApiBearerAuth()
export class TseSyncController {
  constructor(
    private readonly service: TseSyncService,
    @InjectQueue(TSE_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  @Post('trigger/:job')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiParam({ name: 'job', enum: ['presidente-governadores', 'prefeitos-dep-estaduais'] })
  @ApiOperation({ summary: '[Admin] Dispara sync TSE — presidente-governadores ou prefeitos-dep-estaduais' })
  trigger(@Param('job') job: 'presidente-governadores' | 'prefeitos-dep-estaduais') {
    return this.service.triggerSync(job)
  }

  @Get('status')
  @ApiOperation({ summary: '[Admin] Retorna status da fila TSE' })
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
