import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator'
import { MEDIA_FORMAT_ORDER, type MediaFormat } from '@votz/shared-types'

export const MEDIA_DIRECT_UPLOAD_MIME_TYPES = ['video/mp4', 'video/quicktime']
export const MEDIA_VIDEO_MAX_BYTES = 100 * 1024 * 1024

/** Recorte em frações (0 a 1) da imagem original, como a pessoa vê. */
export class MediaCropDto {
  @ApiProperty({ minimum: 0, maximum: 1, example: 0.1 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  x: number

  @ApiProperty({ minimum: 0, maximum: 1, example: 0 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  y: number

  @ApiProperty({ minimum: 0, maximum: 1, example: 0.75 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  w: number

  @ApiProperty({ minimum: 0, maximum: 1, example: 1 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  h: number
}

/** Um arquivo enviado em /media/uploads, com o formato e o enquadramento escolhidos no editor. */
export class PostMediaInputDto {
  @ApiProperty({ description: 'id devolvido pelo envio (/media/uploads)' })
  @IsUUID()
  id: string

  @ApiProperty({ enum: MEDIA_FORMAT_ORDER, description: 'Moldura: todos os itens da publicação usam o formato do primeiro' })
  @IsIn(MEDIA_FORMAT_ORDER as string[])
  format: MediaFormat

  @ApiPropertyOptional({ type: MediaCropDto, description: 'Enquadramento. Sem ele, o centro da foto. GIF ignora.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MediaCropDto)
  crop?: MediaCropDto
}

export class PresignMediaUploadDto {
  @ApiProperty({ enum: MEDIA_DIRECT_UPLOAD_MIME_TYPES, description: 'Vídeo MP4 ou MOV' })
  @IsIn(MEDIA_DIRECT_UPLOAD_MIME_TYPES)
  mimeType: string

  @ApiProperty({ description: 'Tamanho exato do arquivo em bytes (até 100 MB)' })
  @IsInt()
  @Min(1)
  @Max(MEDIA_VIDEO_MAX_BYTES)
  sizeBytes: number
}
