import { Controller, Post, Get, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { UserType } from '@votz/shared-types'
import { TseSyncService, TSE_SYNC_QUEUE, TseJobName } from './tse-sync.service'

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
  @ApiParam({
    name: 'job',
    enum: ['geral', 'municipal', 'presidente-governadores', 'prefeitos-dep-estaduais'],
  })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Ano eleitoral opcional (ex: 2026)' })
  @ApiOperation({ summary: '[Admin] Dispara sync TSE para eleição geral (2026+) ou municipal' })
  trigger(@Param('job') job: TseJobName, @Query('year') yearRaw?: string) {
    const year = yearRaw ? Number(yearRaw) : undefined
    return this.service.triggerSync(job, year && !Number.isNaN(year) ? year : undefined)
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
