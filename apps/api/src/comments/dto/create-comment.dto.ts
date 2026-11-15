import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator'
import { COMMENT_MEDIA_KEY_REGEX } from '../../storage/storage.service'

export enum CommentMediaType {
  TEXT  = 'TEXT',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
}

export class CreateCommentDto {
  @ApiPropertyOptional({ example: 'Este problema persiste há meses.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  content?: string

  @ApiPropertyOptional({ description: 'ID do comentário pai (para respostas)' })
  @IsOptional()
  @IsUUID()
  parentId?: string

  @ApiPropertyOptional({ enum: CommentMediaType, default: CommentMediaType.TEXT })
  @IsOptional()
  @IsEnum(CommentMediaType)
  mediaType?: CommentMediaType

  @ApiPropertyOptional({ description: 'URL pública do áudio/vídeo no R2' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  mediaUrl?: string

  @ApiPropertyOptional({ description: 'Chave do objeto no R2' })
  @IsOptional()
  @IsString()
  @Matches(COMMENT_MEDIA_KEY_REGEX, {
    message: 'mediaKey inválido para mídia de comentário',
  })
  @MaxLength(300)
  mediaKey?: string

  @ApiPropertyOptional({ description: 'Duração em segundos' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  mediaDuration?: number
}
