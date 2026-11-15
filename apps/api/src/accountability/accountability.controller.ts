import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgPermission } from '@prisma/client'
import { Throttle } from '@nestjs/throttler'
import { ActingUser } from '../auth/acting-org'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator'
import { PlanGuard } from '../auth/guards/plan.guard'
import { AccountabilityService } from './accountability.service'
import { CreateAccountabilityReportDto } from './dto/accountability.dto'

@ApiTags('accountability')
@Controller('accountability')
@UseGuards(PlanGuard)
export class AccountabilityController {
  constructor(private readonly service: AccountabilityService) {}

  @Public()
  @Get('public/:code')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Consulta pública imutável de prestação de contas por código' })
  findPublicByCode(@Param('code') code: string) {
    return this.service.findPublicByCode(code)
  }

  @Get('reports')
  @ApiBearerAuth()
  @RequiresFeature('pdf_report', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Listar relatórios de prestação de contas gerados pela organização' })
  list(@CurrentUser() user: ActingUser) {
    return this.service.listReports(user)
  }

  @Post('reports')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequiresFeature('pdf_report', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Solicitar geração assíncrona de prestação de contas em PDF' })
  create(@CurrentUser() user: ActingUser, @Body() dto: CreateAccountabilityReportDto) {
    return this.service.createReport(user, dto)
  }

  @Get('reports/:id/download')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequiresFeature('pdf_report', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Obter URL assinada temporária do PDF no R2 privado' })
  download(@CurrentUser() user: ActingUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSignedDownloadUrl(user, id)
  }
}
