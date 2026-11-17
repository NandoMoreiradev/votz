import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { UserType } from '@votz/shared-types'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { OptionalAuth } from '../auth/decorators/public.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { CreateSuggestionDto } from './dto/create-suggestion.dto'
import { ListSuggestionsQueryDto } from './dto/list-suggestions-query.dto'
import { UpdateSuggestionStatusDto } from './dto/update-suggestion-status.dto'
import { SuggestionsService } from './suggestions.service'

@ApiTags('suggestions')
@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly service: SuggestionsService) {}

  @Get()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar sugestões e melhorias da plataforma' })
  list(
    @Query() query: ListSuggestionsQueryDto,
    @CurrentUser() user?: { id: string },
  ) {
    return this.service.list(query, user?.id)
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 3, ttl: 60_000 }, long: { limit: 15, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Enviar uma sugestão de melhoria para a plataforma' })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSuggestionDto,
  ) {
    return this.service.create(user.id, dto)
  }

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apoiar ou remover apoio de uma sugestão' })
  toggleVote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.toggleVote(id, user.id)
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.MODERATOR, UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar status e resposta oficial de uma sugestão (staff)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @Body() dto: UpdateSuggestionStatusDto,
  ) {
    return this.service.updateStatus(id, actor.id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Excluir sugestão (autor enquanto aberta, ou staff)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string; type: string },
  ) {
    return this.service.remove(id, actor)
  }
}
