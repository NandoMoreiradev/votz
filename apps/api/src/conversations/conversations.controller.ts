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
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ConversationsPrivacyInterceptor } from './conversations-privacy.interceptor'
import { Throttle } from '@nestjs/throttler'
import { ConversationActor, ConversationsService } from './conversations.service'
import {
  ConversationListDto,
  ConversationContactsDto,
  ConversationPaginationDto,
  DirectConversationDto,
  GroupConversationDto,
  InviteConversationDto,
  MuteConversationDto,
  ReportConversationDto,
  RespondConversationDto,
  RoleConversationDto,
  UpdateConversationSettingsDto,
} from './conversations.dto'

@Controller('conversations')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ConversationsPrivacyInterceptor)
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}
  @Get('capabilities') capabilities() {
    return this.service.capabilities()
  }
  @Get('settings')
  settings(@Req() req: { user: ConversationActor }) {
    return this.service.getSettings(req.user)
  }
  @Patch('settings')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  updateSettings(
    @Req() req: { user: ConversationActor },
    @Body() body: UpdateConversationSettingsDto,
  ) {
    return this.service.updateSettings(req.user, body)
  }
  @Get('contacts')
  contacts(@Req() req: { user: ConversationActor }, @Query() query: ConversationContactsDto) {
    return this.service.contacts(req.user, query.q)
  }
  @Get('blocks') blocks(
    @Req() req: { user: ConversationActor },
    @Query() query: ConversationPaginationDto,
  ) {
    return this.service.blocks(req.user, query)
  }
  @Post('blocks/:userId') block(
    @Req() req: { user: ConversationActor },
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.block(req.user, userId, false)
  }
  @Delete('blocks/:userId') unblock(
    @Req() req: { user: ConversationActor },
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.block(req.user, userId, true)
  }
  @Get() list(@Req() req: { user: ConversationActor }, @Query() query: ConversationListDto) {
    return this.service.list(req.user, query)
  }
  @Post('direct')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  direct(@Req() req: { user: ConversationActor }, @Body() body: DirectConversationDto) {
    return this.service.direct(req.user, body.targetUserId)
  }
  @Post('groups')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  group(@Req() req: { user: ConversationActor }, @Body() body: GroupConversationDto) {
    return this.service.group(req.user, body)
  }
  @Get(':id') get(@Req() req: { user: ConversationActor }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.user, id)
  }
  @Post(':id/respond') respond(
    @Req() req: { user: ConversationActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RespondConversationDto,
  ) {
    return this.service.mutate(req.user, id, 'respond', body)
  }
  @Post(':id/invitations') invite(
    @Req() req: { user: ConversationActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: InviteConversationDto,
  ) {
    return this.service.mutate(req.user, id, 'invite', body)
  }
  @Patch(':id/members/:userId/role') role(
    @Req() req: { user: ConversationActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: RoleConversationDto,
  ) {
    return this.service.mutate(req.user, id, 'role', { ...body, userId })
  }
  @Delete(':id/members/:userId') remove(
    @Req() req: { user: ConversationActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.mutate(req.user, id, 'remove', { userId })
  }
  @Post(':id/owner/:userId') transfer(
    @Req() req: { user: ConversationActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.mutate(req.user, id, 'transfer', { userId })
  }
  @Post(':id/leave') leave(
    @Req() req: { user: ConversationActor },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.mutate(req.user, id, 'leave')
  }
  @Post(':id/archive') archive(
    @Req() req: { user: ConversationActor },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.mutate(req.user, id, 'archive')
  }
  @Patch(':id/mute')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  mute(
    @Req() req: { user: ConversationActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MuteConversationDto,
  ) {
    return this.service.mute(req.user, id, body.duration)
  }
  @Post(':id/report')
  @Throttle({ long: { limit: 10, ttl: 3600000 } })
  report(
    @Req() req: { user: ConversationActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReportConversationDto,
  ) {
    return this.service.report(req.user, id, body)
  }
}
