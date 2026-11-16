import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgPermission } from '@prisma/client'
import { Throttle } from '@nestjs/throttler'
import { ActingUser } from '../auth/acting-org'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator'
import { PlanGuard } from '../auth/guards/plan.guard'
import {
  AssignReportDto,
  SlaPerformanceQueryDto,
  SlaQueueFilterDto,
  UpdateSlaPolicyDto,
} from './dto/sla.dto'
import { SlaService } from './sla.service'

@ApiTags('sla')
@ApiBearerAuth()
@Controller('sla')
@UseGuards(PlanGuard)
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  @Get('queue')
  @RequiresFeature('sla_panel', 'ENTITY', OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Fila priorizada de relatos da entidade por urgência de SLA' })
  listQueue(@CurrentUser() user: ActingUser, @Query() query: SlaQueueFilterDto) {
    return this.sla.listQueue(user, query)
  }

  @Get('members')
  @RequiresFeature('sla_panel', 'ENTITY', OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Membros ativos da entidade disponíveis para atribuição na fila' })
  listAssignableMembers(@CurrentUser() user: ActingUser) {
    return this.sla.listAssignableMembers(user)
  }

  @Get('workload')
  @RequiresFeature('sla_panel', 'ENTITY', OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Carga de trabalho aberta e vencida por membro da entidade' })
  getWorkload(@CurrentUser() user: ActingUser) {
    return this.sla.getTeamWorkload(user)
  }

  @Get('performance')
  @RequiresFeature('sla_panel', 'ENTITY', OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Desempenho histórico de SLA da entidade (série mensal, categorias e mediana)' })
  getPerformance(@CurrentUser() user: ActingUser, @Query() query: SlaPerformanceQueryDto) {
    return this.sla.getPerformance(user, query)
  }

  @Get('policy')
  @RequiresFeature('sla_panel', 'ENTITY', OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Consultar política de SLA, escalonamento e envio automático de relatório mensal' })
  getPolicy(@CurrentUser() user: ActingUser) {
    return this.sla.getPolicy(user)
  }

  @Patch('policy')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequiresFeature('sla_panel', 'ENTITY', OrgPermission.MANAGE_PROFILE)
  @ApiOperation({ summary: 'Atualizar política de SLA da entidade (prospectiva por padrão; opcionalmente recalcula abertos)' })
  updatePolicy(@CurrentUser() user: ActingUser, @Body() dto: UpdateSlaPolicyDto) {
    return this.sla.updatePolicy(user, dto)
  }

  @Post('reports/:reportId/assign')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @RequiresFeature('sla_panel', 'ENTITY', OrgPermission.ASSIGN_REPORTS)
  @ApiOperation({ summary: 'Atribuir ou reatribuir responsável interno por um relato da entidade' })
  assignReport(
    @CurrentUser() user: ActingUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: AssignReportDto,
  ) {
    return this.sla.assignReport(user, reportId, dto)
  }

  @Get('reports/:reportId/assignments')
  @RequiresFeature('sla_panel', 'ENTITY', OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Histórico interno de atribuições de um relato da entidade' })
  getAssignmentHistory(
    @CurrentUser() user: ActingUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.sla.getAssignmentHistory(user, reportId)
  }
}
