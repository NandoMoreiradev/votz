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
    if (!file) throw new BadRequestException('Nenhum arquivo enviado')

    const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
    if (!imageTypes.has(file.mimetype)) {
      throw new BadRequestException('Avatar deve ser JPEG, PNG ou WebP')
    }

    return this.storageService.upload(file.buffer, file.mimetype, 'avatars')
  }
}
