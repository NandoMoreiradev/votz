import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { ActingUser } from '../auth/acting-org'
import { AddChannelDto } from './dto/add-channel.dto'
import { YoutubeChannelsService } from './youtube-channels.service'

@ApiTags('youtube')
@ApiBearerAuth()
@Controller('youtube/channels')
export class YoutubeController {
  constructor(private readonly service: YoutubeChannelsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Canais do YouTube da organização ativa (com código de verificação)' })
  list(@CurrentUser() user: ActingUser) {
    return this.service.list(user)
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registrar um canal e gerar o código para colar na descrição dele' })
  add(@Body() dto: AddChannelDto, @CurrentUser() user: ActingUser) {
    return this.service.add(user, dto.channel)
  }

  @Post(':id/verify')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verificar o canal: confere o código na descrição pública do canal' })
  verify(@Param('id') id: string, @CurrentUser() user: ActingUser) {
    return this.service.verify(user, id)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remover um canal da organização' })
  remove(@Param('id') id: string, @CurrentUser() user: ActingUser) {
    return this.service.remove(user, id)
  }
}
