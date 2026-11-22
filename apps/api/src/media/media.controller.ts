import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { MEDIA_VIDEO_MAX_BYTES, PresignMediaUploadDto } from './dto/media.dto'
import { MediaAssetsService } from './media-assets.service'

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaAssetsService) {}

  @Post('uploads')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 20, ttl: 60_000 }, long: { limit: 120, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_VIDEO_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({
    summary:
      'Envia foto, GIF ou vídeo para uma publicação. Devolve id e tamanho; o formato e o enquadramento vão em `mediaAssets` ao criar a publicação.',
  })
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: { id: string }) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado')
    return this.media.upload(user.id, file.buffer)
  }

  @Post('uploads/presign')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 40, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Pede o endereço para enviar um vídeo direto ao armazenamento (PUT). Depois, confirme em /media/uploads/:id/complete.' })
  presign(@Body() dto: PresignMediaUploadDto, @CurrentUser() user: { id: string }) {
    return this.media.presign(user.id, dto)
  }

  @Post('uploads/:id/complete')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 20, ttl: 60_000 }, long: { limit: 60, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Confirma o envio direto: confere tamanho, tipo real e se o vídeo abre. Devolve o mesmo formato de /media/uploads.' })
  complete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: { id: string }) {
    return this.media.complete(user.id, id)
  }

  @Delete('uploads/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um arquivo enviado e ainda não publicado.' })
  async discard(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: { id: string }) {
    await this.media.discard(user.id, id)
  }
}
