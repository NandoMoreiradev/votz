import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { FlagStatus } from '@prisma/client'
import { UserType } from '@votz/shared-types'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { CreateFlagDto } from './dto/create-flag.dto'
import { ListFlagsQueryDto } from './dto/list-flags-query.dto'
import { ResolveFlagDto } from './dto/resolve-flag.dto'
import { ModerationService } from './moderation.service'

@ApiTags('moderation')
@Controller('moderation')
export class ModerationController {
  constructor(private readonly service: ModerationService) {}

  @Post('flags')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({
    short: { limit: 5, ttl: 60_000 },
    medium: { limit: 10, ttl: 600_000 },
    long: { limit: 20, ttl: 3_600_000 },
  })
  @ApiOperation({ summary: 'Sinalizar relato ou comentário para revisão da moderação' })
  @ApiResponse({ status: 201, description: 'Sinalização registrada.' })
  @ApiResponse({ status: 403, description: 'E-mail não verificado ou tentativa de sinalizar o próprio conteúdo.' })
  @ApiResponse({ status: 404, description: 'Conteúdo não encontrado.' })
  @ApiResponse({ status: 409, description: 'Usuário já sinalizou este conteúdo.' })
  createFlag(
    @CurrentUser() user: { id: string; emailVerified: boolean },
    @Body() dto: CreateFlagDto,
  ) {
    return this.service.createFlag(user, dto)
  }
}

@ApiTags('admin')
@Controller('admin/flags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.MODERATOR, UserType.ADMIN)
@ApiBearerAuth()
export class AdminFlagsController {
  constructor(private readonly service: ModerationService) {}

  @Get()
  @ApiOperation({ summary: 'Listar sinalizações de conteúdo com prévia do alvo' })
  listFlags(@Query() query: ListFlagsQueryDto) {
    return this.service.listFlags(query.status ?? FlagStatus.OPEN, query.page ?? 1, query.limit ?? 20)
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolver sinalização (descartar ou remover conteúdo)' })
  resolveFlag(
    @Param('id') id: string,
    @Body() dto: ResolveFlagDto,
    @CurrentUser() actor: { id: string; type: string },
  ) {
    return this.service.resolveFlag(id, actor, dto)
  }
}
