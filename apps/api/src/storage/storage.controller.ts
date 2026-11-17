import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { StorageService } from './storage.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload/report-media')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 30, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload media file for a report (image, video, pdf)' })
  async uploadReportMedia(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() _user: { id: string },
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado')
    return this.storageService.upload(file.buffer, file.mimetype, 'reports')
  }

  @Post('upload/avatar')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 5, ttl: 60_000 }, long: { limit: 10, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload user avatar (image only)' })
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() _user: { id: string },
  ) {
    return this.uploadImageToFolder(file, 'avatars', 'Avatar deve ser JPEG, PNG ou WebP')
  }

  @Post('upload/entity-logo')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 5, ttl: 60_000 }, long: { limit: 10, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload entity or company logo (image only)' })
  async uploadEntityLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() _user: { id: string },
  ) {
    return this.uploadImageToFolder(file, 'entities', 'Logo deve ser JPEG, PNG ou WebP')
  }

  private async uploadImageToFolder(
    file: Express.Multer.File,
    folder: 'avatars' | 'entities',
    invalidTypeMessage: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado')

    const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
    if (!imageTypes.has(file.mimetype)) {
      throw new BadRequestException(invalidTypeMessage)
    }

    return this.storageService.upload(file.buffer, file.mimetype, folder)
  }

  @Post('upload/verification-doc')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 2, ttl: 1_000 }, medium: { limit: 5, ttl: 60_000 }, long: { limit: 10, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload a verification document (selfie, ID, title voter). Stored privately.' })
  async uploadVerificationDoc(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() _user: { id: string },
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado')

    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException('Documento deve ser JPEG, PNG, WebP ou PDF')
    }

    const { key, mimeType, size } = await this.storageService.upload(file.buffer, file.mimetype, 'verification')
    // Return only key — URL is private, accessible only via signed URLs
    return { key, mimeType, size }
  }

  @Post('upload/post-media')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 15, ttl: 60_000 }, long: { limit: 60, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload de mídia para publicação no feed (imagem, gif ou vídeo)' })
  async uploadPostMedia(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() _user: { id: string },
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado')
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/quicktime',
    ])
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException('Arquivo deve ser imagem (JPEG, PNG, WebP, GIF) ou vídeo (MP4, MOV)')
    }
    return this.storageService.upload(file.buffer, file.mimetype, 'posts')
  }

  @Post('upload/post-comment-media')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 15, ttl: 60_000 }, long: { limit: 50, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload de imagem, GIF ou áudio para comentário de publicação' })
  async uploadPostCommentMedia(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() _user: { id: string },
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado')
    return this.storageService.upload(file.buffer, file.mimetype, 'post-comments')
  }

  @Post('upload/comment-audio')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload áudio de comentário (webm/mp4/ogg/wav, máx 50 MB)' })
  async uploadCommentAudio(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() _user: { id: string },
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado')
    return this.storageService.upload(file.buffer, file.mimetype, 'comments')
  }
}
