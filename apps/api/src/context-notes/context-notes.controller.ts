import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { UserType } from '@votz/shared-types'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { ContextNotesService } from './context-notes.service'
import {
  AdminListContextNotesDto,
  ContextNoteTargetDto,
  CreateContextNoteDto,
  JoinContributorDto,
  RateContextNoteDto,
  RemoveContextNoteDto,
  ShownNotesQueryDto,
} from './dto/context-notes.dto'

@ApiTags('context-notes')
@Controller('context-notes')
export class ContextNotesController {
  constructor(private readonly service: ContextNotesService) {}

  @Get('config')
  @Public()
  @ApiOperation({ summary: 'O Contexto da Comunidade está liberado?' })
  config() {
    return { enabled: this.service.isEnabled() }
  }

  @Get('shown')
  @Public()
  @Throttle({ short: { limit: 20, ttl: 1000 }, medium: { limit: 100, ttl: 10_000 } })
  @ApiOperation({ summary: 'Notas exibidas para publicações e relatos (uma por conteúdo)' })
  shown(@Query() query: ShownNotesQueryDto) {
    return this.service.listShown(query.postIds, query.reportIds)
  }

  @Get('contributor/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Situação da pessoa como colaboradora' })
  me(@CurrentUser() user: { id: string }) {
    return this.service.getContributorStatus(user.id)
  }

  @Post('contributor')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(201)
  @ApiOperation({ summary: 'Entrar como colaborador (aceita o termo do colaborador)' })
  join(@CurrentUser() user: { id: string }, @Body() dto: JoinContributorDto) {
    return this.service.joinAsContributor(user.id, dto)
  }

  @Get('queue')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Notas para avaliar e conteúdos que pediram contexto' })
  queue(@CurrentUser() user: { id: string }) {
    return this.service.queue(user.id)
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 3, ttl: 60_000 }, medium: { limit: 8, ttl: 600_000 }, long: { limit: 15, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Escrever uma nota de contexto (com fonte)' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateContextNoteDto) {
    return this.service.createNote(user.id, dto)
  }

  @Post('requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(201)
  @Throttle({ short: { limit: 5, ttl: 60_000 }, medium: { limit: 15, ttl: 600_000 }, long: { limit: 40, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Pedir contexto para uma publicação ou relato' })
  request(@CurrentUser() user: { id: string; emailVerified: boolean }, @Body() dto: ContextNoteTargetDto) {
    return this.service.requestContext(user, dto)
  }

  @Put(':id/rating')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 10, ttl: 60_000 }, medium: { limit: 60, ttl: 600_000 }, long: { limit: 200, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Avaliar uma nota (ajuda, ajuda um pouco, não ajuda)' })
  rate(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RateContextNoteDto) {
    return this.service.rateNote(user.id, id, dto)
  }
}

@ApiTags('admin')
@Controller('admin/context-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.MODERATOR, UserType.ADMIN)
@ApiBearerAuth()
export class AdminContextNotesController {
  constructor(private readonly service: ContextNotesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notas de contexto, com prévia do conteúdo' })
  list(@Query() query: AdminListContextNotesDto) {
    return this.service.adminList(query.status, query.page ?? 1, query.limit ?? 20)
  }

  @Post(':id/remove')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remover uma nota (motivo obrigatório; avisa quem escreveu)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RemoveContextNoteDto, @CurrentUser() actor: { id: string }) {
    return this.service.removeByModeration(id, actor.id, dto.reason)
  }

  @Post('recalculate')
  @HttpCode(200)
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Rodar agora a conta de hora em hora (só admin)' })
  recalculate() {
    return this.service.recalculateAll()
  }

  @Post('contributors/:userId/grant-write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Liberar a escrita de notas para um colaborador' })
  grantWrite(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.grantWrite(userId)
  }

  @Post('contributors/:userId/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspender um colaborador' })
  suspend(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.setSuspended(userId, true)
  }

  @Post('contributors/:userId/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reativar um colaborador suspenso' })
  restore(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.setSuspended(userId, false)
  }
}
