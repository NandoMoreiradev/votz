import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PropostasService } from './propostas.service'
import { CreatePropostaDto } from './dto/create-proposta.dto'
import { UpdatePropostaStatusDto } from './dto/update-status-proposta.dto'
import { ListPropostasQueryDto } from './dto/list-propostas-query.dto'
import { VotePropostaDto } from './dto/vote-proposta.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('propostas')
@Controller('propostas')
export class PropostasController {
  constructor(private readonly propostasService: PropostasService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar proposta política (apenas políticos)' })
  create(
    @Body() dto: CreatePropostaDto,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.propostasService.create(dto, user)
  }

  @Get()
  @ApiOperation({ summary: 'Listar propostas com filtros e paginação' })
  findAll(@Query() query: ListPropostasQueryDto) {
    return this.propostasService.findAll(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar proposta por ID com timeline' })
  findById(@Param('id') id: string) {
    return this.propostasService.findById(id)
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar status da proposta (apenas o político autor)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePropostaStatusDto,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.propostasService.updateStatus(id, dto, user)
  }

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Votar em uma proposta (apoiar ou rejeitar)' })
  votar(
    @Param('id') id: string,
    @Body() dto: VotePropostaDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.propostasService.votar(id, dto.apoio, user.id)
  }

  @Delete(':id/vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remover voto de uma proposta' })
  removerVoto(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.propostasService.removerVoto(id, user.id)
  }

  @Get(':id/vote/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ver meu voto em uma proposta' })
  meuVoto(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.propostasService.meuVoto(id, user.id)
  }
}
