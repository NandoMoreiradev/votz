import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { CreatePressRadarRuleDto, UpdatePressRadarRuleDto } from './dto/press-radar.dto'
import { PressRadarService } from './press-radar.service'

@ApiTags('imprensa')
@ApiBearerAuth()
@Controller('imprensa/radar')
export class PressRadarController {
  constructor(private readonly service: PressRadarService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[PRESS] Meus avisos do radar' })
  list(@CurrentUser() user: { id: string }) {
    return this.service.listRules(user.id)
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 3, ttl: 10_000 }, medium: { limit: 30, ttl: 3_600_000 }, long: { limit: 100, ttl: 86_400_000 } })
  @ApiOperation({ summary: '[PRESS] Criar aviso do radar (limite por plano)' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreatePressRadarRuleDto) {
    return this.service.createRule(user.id, dto)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[PRESS] Pausar, religar ou renomear um aviso' })
  update(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePressRadarRuleDto,
  ) {
    return this.service.updateRule(user.id, id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[PRESS] Apagar um aviso' })
  remove(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRule(user.id, id)
  }
}
