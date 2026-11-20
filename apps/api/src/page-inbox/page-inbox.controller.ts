import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { OrgPermission, OrgType } from '@prisma/client'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { OrgPermissionGuard, RequireOrgPermission } from '../org-memberships/org-memberships.guard'
import { PageInboxService } from './page-inbox.service'
import {
  PageFollowersQueryDto,
  PageListQueryDto,
  PageMessageDto,
  PageRespondDto,
  PageStartDto,
  PageStatusDto,
} from './dto/page-inbox.dto'

type Authed = { id: string; emailVerified?: boolean }

function requireVerified(user: Authed) {
  if (!user.emailVerified) throw new ForbiddenException('Confirme seu e-mail para enviar mensagens.')
}

@ApiTags('page-inbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('page-inbox')
export class PageInboxController {
  constructor(private readonly service: PageInboxService) {}

  // ── Cidadão ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Minhas conversas com páginas' })
  @Get('mine')
  mine(@CurrentUser() user: Authed, @Query() query: PageListQueryDto) {
    return this.service.myConversations(user.id, query.page)
  }

  @ApiOperation({ summary: 'Mensagens de páginas não lidas pelo cidadão' })
  @Get('mine/unread')
  mineUnread(@CurrentUser() user: Authed) {
    return this.service.citizenUnreadCount(user.id)
  }

  @ApiOperation({ summary: 'Abrir uma conversa minha com uma página' })
  @Get('mine/:id')
  mineOne(@CurrentUser() user: Authed, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.myConversation(user.id, id)
  }

  @ApiOperation({ summary: 'Aceitar ou recusar uma conversa que a página começou' })
  @Post('mine/:id/respond')
  respond(@CurrentUser() user: Authed, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PageRespondDto) {
    return this.service.respondAsCitizen(user.id, id, dto.accept)
  }

  @ApiOperation({ summary: 'Apagar minha conversa com uma página' })
  @Delete('mine/:id')
  deleteMine(@CurrentUser() user: Authed, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteMine(user.id, id)
  }

  @ApiOperation({ summary: 'Minha conversa com esta página, se já existir' })
  @Get(':orgType/:orgId/thread')
  thread(
    @CurrentUser() user: Authed,
    @Param('orgType', new ParseEnumPipe(OrgType)) orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ) {
    return this.service.myThreadWithPage(user.id, orgType, orgId)
  }

  @ApiOperation({ summary: 'Enviar mensagem para a equipe de uma página' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':orgType/:orgId/messages')
  send(
    @CurrentUser() user: Authed,
    @Param('orgType', new ParseEnumPipe(OrgType)) orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: PageMessageDto,
  ) {
    requireVerified(user)
    return this.service.sendAsCitizen(user.id, orgType, orgId, dto.text)
  }

  // ── Equipe da página ───────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Conversas que esperam resposta (selo no painel)' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.READ_MESSAGES)
  @Get(':orgType/:orgId/unread')
  unread(
    @Param('orgType', new ParseEnumPipe(OrgType)) orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ) {
    return this.service.staffUnreadCount(orgType, orgId)
  }

  @ApiOperation({ summary: 'Caixa de entrada da página' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.READ_MESSAGES)
  @Get(':orgType/:orgId/conversations')
  list(
    @Param('orgType', new ParseEnumPipe(OrgType)) orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() query: PageListQueryDto,
  ) {
    return this.service.listForStaff(orgType, orgId, query.status, query.page)
  }

  @ApiOperation({ summary: 'Abrir uma conversa da página (fica registrado quem leu)' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.READ_MESSAGES)
  @Get(':orgType/:orgId/conversations/:id')
  open(
    @CurrentUser() user: Authed,
    @Param('orgType', new ParseEnumPipe(OrgType)) orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.openForStaff(user.id, orgType, orgId, id)
  }

  @ApiOperation({ summary: 'Seguidores que a página pode chamar' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.REPLY_MESSAGES)
  @Get(':orgType/:orgId/followers')
  followers(
    @Param('orgType', new ParseEnumPipe(OrgType)) orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() query: PageFollowersQueryDto,
  ) {
    return this.service.followersForStaff(orgType, orgId, query.q)
  }

  @ApiOperation({ summary: 'A página começa uma conversa com um seguidor' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.REPLY_MESSAGES)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':orgType/:orgId/conversations')
  start(
    @CurrentUser() user: Authed,
    @Param('orgType', new ParseEnumPipe(OrgType)) orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: PageStartDto,
  ) {
    return this.service.startAsStaff(user.id, orgType, orgId, dto.citizenId, dto.text)
  }

  @ApiOperation({ summary: 'Responder como equipe da página' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.REPLY_MESSAGES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':orgType/:orgId/conversations/:id/replies')
  reply(
    @CurrentUser() user: Authed,
    @Param('orgType', new ParseEnumPipe(OrgType)) orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PageMessageDto,
  ) {
    return this.service.replyAsStaff(user.id, orgType, orgId, id, dto.text)
  }

  @ApiOperation({ summary: 'Marcar como resolvida, reabrir ou bloquear' })
  @UseGuards(OrgPermissionGuard)
  @RequireOrgPermission(OrgPermission.REPLY_MESSAGES)
  @Patch(':orgType/:orgId/conversations/:id')
  status(
    @Param('orgType', new ParseEnumPipe(OrgType)) orgType: OrgType,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PageStatusDto,
  ) {
    return this.service.setStatus(orgType, orgId, id, dto.status)
  }
}
