import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgPermission } from '@prisma/client'
import { Throttle } from '@nestjs/throttler'
import { ActingUser } from '../auth/acting-org'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator'
import { PlanGuard } from '../auth/guards/plan.guard'
import { AlertRulesService } from './alert-rules.service'
import { CreateAlertRuleDto, UpdateAlertRuleDto } from './dto/alert-rule.dto'

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts/rules')
@UseGuards(PlanGuard)
export class AlertRulesController {
  constructor(private readonly service: AlertRulesService) {}

  @Get()
  @RequiresFeature('outbreak_alerts', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Listar regras de alerta configuradas para a organização' })
  list(@CurrentUser() user: ActingUser) {
    return this.service.listRules(user)
  }

  @Get('history')
  @RequiresFeature('outbreak_alerts', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Histórico recente de disparos de alerta (deduplicados)' })
  history(@CurrentUser() user: ActingUser) {
    return this.service.listHistory(user)
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequiresFeature('outbreak_alerts', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Criar nova regra de alerta (limite por plano)' })
  create(@CurrentUser() user: ActingUser, @Body() dto: CreateAlertRuleDto) {
    return this.service.createRule(user, dto)
  }

  @Patch(':id')
  @RequiresFeature('outbreak_alerts', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Atualizar ou ativar/pausar regra de alerta' })
  update(
    @CurrentUser() user: ActingUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.service.updateRule(user, id, dto)
  }

  @Delete(':id')
  @RequiresFeature('outbreak_alerts', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Remover regra de alerta' })
  remove(@CurrentUser() user: ActingUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRule(user, id)
  }
}
