import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ConversationsPrivacyInterceptor } from './conversations-privacy.interceptor'
import { ConversationActor } from './conversations.service'
import { CHAT_MEDIA_MAX_BYTES, ChatService } from './chat.service'
import {
  ChatPushTokenDto,
  ChatTypingDto,
  ApproveChatDeviceCodeDto,
  DecideChatDeviceLinkDto,
  ResetChatDevicesDto,
  ChatPrivacyDto,
  ChatReceiptDto,
  ChatReceiptQueryDto,
  ChatStorageListQueryDto,
  DeleteChatMediaDto,
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
  // Um aparelho aguardando aprovação repete este pedido a cada ~4 s por até 10
  // minutos; o limite precisa comportar isso sem deixar de conter abuso (no
  // máximo 3 pedidos pendentes e 5 aparelhos por conta, no serviço).
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  enroll(@Req() req: Request, @Body() body: EnrollChatDeviceDto) {
    return this.service.enroll(req.user, body)
  }
  @Post('chat/devices/reset')
  // Exige a senha da conta; limite baixo para não virar tentativa de adivinhar senha.
  @Throttle({ long: { limit: 10, ttl: 3600000 } })
  reset(@Req() req: Request, @Body() body: ResetChatDevicesDto) {
    return this.service.reset(req.user, body.password)
  }
  @Get('chat/devices/status')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  deviceStatus(@Req() req: Request) {
    return this.service.deviceStatus(req.user, this.device(req))
  }
  @Get('chat/devices') devices(@Req() req: Request) {
    return this.service.devices(req.user, this.device(req))
  }
  @Post('chat/device-links/approve-code')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  approveByCode(@Req() req: Request, @Body() body: ApproveChatDeviceCodeDto) {
    return this.service.approveByCode(
      req.user,
      this.device(req),
      body.code,
      body.linkId,
    )
  }
  @Post('chat/device-links/:id') @Throttle({ long: { limit: 20, ttl: 60000 } })
  decideLink(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecideChatDeviceLinkDto,
  ) {
    return this.service.decideLink(req.user, this.device(req), id, body.approve)
  }
  @Put('chat/devices/push-token')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  registerPushToken(@Req() req: Request, @Body() body: ChatPushTokenDto) {
    return this.service.registerPushToken(req.user, this.device(req), body.token)
  }
  @Delete('chat/devices/push-token')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  clearPushToken(@Req() req: Request) {
    return this.service.clearPushToken(req.user, this.device(req))
  }
  @Delete('chat/devices/:id') @Throttle({ long: { limit: 20, ttl: 60000 } })
  revoke(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.revokeDevice(req.user, this.device(req), id)
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
  @Post(':id/chat/seen')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  seen(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.seen(req.user, this.device(req), id)
  }
  @Post(':id/chat/typing')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  typing(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChatTypingDto,
  ) {
    return this.service.typing(req.user, id, body.typing)
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
  @Post(':id/chat/media')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: CHAT_MEDIA_MAX_BYTES } }),
  )
  uploadMedia(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: { buffer?: Buffer },
    // Campo de texto "kind" do mesmo multipart: IMAGE, VIDEO, AUDIO ou FILE (só para a tela de espaço).
    @Body('kind') kind?: string,
  ) {
    return this.service.uploadMedia(
      req.user,
      this.device(req),
      id,
      file?.buffer ?? Buffer.alloc(0),
      kind,
    )
  }
  @Get('chat/storage')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  storage(@Req() req: Request, @Query() query: ChatStorageListQueryDto) {
    return this.service.listMedia(req.user, this.device(req), query)
  }
  @Delete('chat/storage')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  deleteStorage(@Req() req: Request, @Body() body: DeleteChatMediaDto) {
    return this.service.deleteMedia(req.user, this.device(req), body.ids)
  }
  @Get(':id/chat/media/:attachmentId')
  async downloadMedia(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer } = await this.service.downloadMedia(
      req.user,
      this.device(req),
      id,
      attachmentId,
    )
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(buffer)
  }
}
