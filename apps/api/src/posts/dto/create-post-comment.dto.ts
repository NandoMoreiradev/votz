import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PostCommentMediaType } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator'
import { POST_COMMENT_MEDIA_KEY_REGEX } from '../../storage/storage.service'

export class CreatePostCommentDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  content?: string

  @ApiPropertyOptional({ description: 'ID do comentário pai (resposta)' })
  @IsOptional()
  @IsUUID()
  parentId?: string

  @ApiPropertyOptional({ enum: PostCommentMediaType, default: PostCommentMediaType.TEXT })
  @IsOptional()
  @IsEnum(PostCommentMediaType)
  mediaType?: PostCommentMediaType

  @ApiPropertyOptional({ description: 'URL da imagem, GIF (R2 ou KLIPY/GIPHY) ou áudio' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  mediaUrl?: string

  @ApiPropertyOptional({ description: 'Chave do objeto no R2 quando enviado pelo Votz' })
  @IsOptional()
  @IsString()
  @Matches(POST_COMMENT_MEDIA_KEY_REGEX, {
    message: 'mediaKey inválido para mídia de comentário',
  })
  @MaxLength(300)
  mediaKey?: string

  @ApiPropertyOptional({ description: 'Duração do áudio em segundos (apenas autor do post)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  mediaDuration?: number
}

export class VotePostPollDto {
  @ApiProperty()
  @IsUUID()
  optionId: string
}
