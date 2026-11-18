import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ConversationsPrivacyInterceptor } from './conversations-privacy.interceptor'
import { ConversationActor } from './conversations.service'
import { ChatService } from './chat.service'
import {
  ChatPrivacyDto,
  ChatReceiptDto,
  ChatReceiptQueryDto,
  EnrollChatDeviceDto,
  SendChatMessageDto,
} from './chat.dto'
type Request = {
  user: ConversationActor
  headers: Record<string, string | string[] | undefined>
}
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ConversationsPrivacyInterceptor)
export class ChatController {
  constructor(private readonly service: ChatService) {}
  private device(req: Request) {
    return {
      id:
        typeof req.headers['x-votz-chat-device'] === 'string'
          ? req.headers['x-votz-chat-device']
          : undefined,
      secret:
        typeof req.headers['x-votz-chat-secret'] === 'string'
          ? req.headers['x-votz-chat-secret']
          : undefined,
    }
  }
  @Post('chat/devices')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  enroll(@Req() req: Request, @Body() body: EnrollChatDeviceDto) {
    return this.service.enroll(req.user, body)
  }
  @Post('chat/keys/upload') upload(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.keys(req.user, this.device(req), 'upload', body)
  }
  @Post('chat/keys/query') query(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.keys(req.user, this.device(req), 'query', body)
  }
  @Post('chat/keys/claim') claim(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.keys(req.user, this.device(req), 'claim', body)
  }
  @Put('chat/to-device/:type/:txn') toDevice(
    @Req() req: Request,
    @Param('type') type: string,
    @Param('txn') txn: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.toDevice(req.user, this.device(req), type, txn, body)
  }
  @Get('chat/sync') sync(@Req() req: Request, @Query('since') since?: string) {
    return this.service.sync(req.user, this.device(req), since)
  }
  @Get('chat/privacy') privacy(@Req() req: Request) {
    return this.service.privacy(req.user, this.device(req))
  }
  @Put('chat/privacy') updatePrivacy(
    @Req() req: Request,
    @Body() body: ChatPrivacyDto,
  ) {
    return this.service.setPrivacy(
      req.user,
      this.device(req),
      body.readReceiptsEnabled,
    )
  }
  @Get(':id/chat') transport(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.transport(req.user, this.device(req), id)
  }
  @Get(':id/chat/messages') history(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
  ) {
    return this.service.history(req.user, this.device(req), id, from)
  }
  @Put(':id/chat/messages/:txn') send(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('txn') txn: string,
    @Body() body: SendChatMessageDto,
  ) {
    return this.service.send(req.user, this.device(req), id, txn, body)
  }
  @Post(':id/chat/receipts/query') receipts(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChatReceiptQueryDto,
  ) {
    return this.service.receipts(req.user, this.device(req), id, body.eventIds)
  }
  @Post(':id/chat/receipts') acknowledge(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChatReceiptDto,
  ) {
    return this.service.acknowledge(req.user, this.device(req), id, body)
  }
}
