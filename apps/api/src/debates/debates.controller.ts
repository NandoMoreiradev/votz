import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { DebatesService } from './debates.service'
import { CreateDebateDto } from './dto/create-debate.dto'
import { ListDebatesDto } from './dto/list-debates.dto'
import { UpdateDebateDto } from './dto/update-debate.dto'
import { CreateQuestionDto } from './dto/create-question.dto'
import { CreatePollDto } from './dto/create-poll.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('debates')
@Controller('debates')
export class DebatesController {
  constructor(private readonly service: DebatesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar debate e enviar convites a outros políticos' })
  create(@Body() dto: CreateDebateDto, @CurrentUser() user: { id: string }) {
    return this.service.create(user.id, dto)
  }

  @Get()
  @ApiOperation({ summary: 'Listar debates (filtros: status, politicianId, upcoming)' })
  findAll(@Query() query: ListDebatesDto) {
    return this.service.findAll(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um debate' })
  findById(@Param('id') id: string) {
    return this.service.findById(id)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar debate (título, descrição, horário, gravação, cooldown do chat)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDebateDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.update(id, user.id, dto)
  }

  @Post(':id/invite/:politicianId/respond')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Aceitar ou recusar convite para debate' })
  @ApiParam({ name: 'politicianId', description: 'ID do político convidado' })
  respondInvite(
    @Param('id') debateId: string,
    @Param('politicianId') politicianId: string,
    @Body('accept') accept: boolean,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.respondInvite(debateId, politicianId, accept, user.id)
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Iniciar debate ao vivo — cria sala LiveKit e inicia HLS Egress' })
  start(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.service.start(id, user.id)
  }

  @Post(':id/end')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerrar debate — para Egress e enfileira processamento da gravação' })
  end(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.service.end(id, user.id)
  }

  @Get(':id/token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter token LiveKit para transmitir (apenas participantes confirmados)' })
  getLivekitToken(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.service.getLivekitToken(id, user.id)
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Últimas 50 mensagens do chat (carregadas ao entrar no debate)' })
  findMessages(@Param('id') id: string) {
    return this.service.findMessages(id)
  }

  @Get(':id/polls/active')
  @ApiOperation({ summary: 'Enquete ativa no momento (null se não houver)' })
  findActivePoll(@Param('id') id: string) {
    return this.service.findActivePoll(id)
  }

  @Post(':id/questions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enviar pergunta ao debate' })
  createQuestion(
    @Param('id') debateId: string,
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.createQuestion(debateId, user.id, dto)
  }

  @Post(':id/questions/:questionId/upvote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upvotar uma pergunta' })
  upvoteQuestion(@Param('id') debateId: string, @Param('questionId') questionId: string) {
    return this.service.upvoteQuestion(debateId, questionId)
  }

  @Get(':id/questions')
  @ApiOperation({ summary: 'Listar perguntas ordenadas por upvotes' })
  findQuestions(@Param('id') debateId: string) {
    return this.service.findQuestions(debateId)
  }

  @Post(':id/polls')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar enquete durante o debate (apenas participantes)' })
  createPoll(
    @Param('id') debateId: string,
    @Body() dto: CreatePollDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.createPoll(debateId, user.id, dto)
  }

  @Post(':id/polls/:pollId/vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Votar em uma opção da enquete' })
  votePoll(
    @Param('id') debateId: string,
    @Param('pollId') pollId: string,
    @Body('optionId') optionId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.votePoll(debateId, pollId, optionId, user.id)
  }
}
