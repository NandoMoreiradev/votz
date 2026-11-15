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
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto'
import { WebhooksService } from './webhooks.service'

@ApiTags('webhooks')
@ApiBearerAuth()
@Controller('webhooks')
@UseGuards(PlanGuard)
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Get()
  @RequiresFeature('webhooks', undefined, OrgPermission.MANAGE_PROFILE)
  @ApiOperation({ summary: 'Listar endpoints de webhook da organização ativa' })
  list(@CurrentUser() user: ActingUser) {
    return this.service.listEndpoints(user)
  }

  @Post()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @RequiresFeature('webhooks', undefined, OrgPermission.MANAGE_PROFILE)
  @ApiOperation({ summary: 'Criar endpoint de webhook (segredo retornado apenas na criação)' })
  create(@CurrentUser() user: ActingUser, @Body() dto: CreateWebhookDto) {
    return this.service.createEndpoint(user, dto)
  }

  @Patch(':id')
  @RequiresFeature('webhooks', undefined, OrgPermission.MANAGE_PROFILE)
  @ApiOperation({ summary: 'Atualizar endpoint ou reativar webhook' })
  update(
    @CurrentUser() user: ActingUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.service.updateEndpoint(user, id, dto)
  }

  @Delete(':id')
  @RequiresFeature('webhooks', undefined, OrgPermission.MANAGE_PROFILE)
  @ApiOperation({ summary: 'Remover endpoint de webhook' })
  remove(@CurrentUser() user: ActingUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteEndpoint(user, id)
  }

  @Get(':id/deliveries')
  @RequiresFeature('webhooks', undefined, OrgPermission.MANAGE_PROFILE)
  @ApiOperation({ summary: 'Histórico recente de entregas e latência do webhook' })
  deliveries(@CurrentUser() user: ActingUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.listDeliveries(user, id)
  }
}
