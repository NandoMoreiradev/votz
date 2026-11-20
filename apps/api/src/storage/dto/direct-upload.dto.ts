import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsInt, Matches, Max, Min } from 'class-validator'
import { DIRECT_UPLOAD_MIME_TYPES } from '../direct-upload.service'

export class PresignUploadDto {
  @ApiProperty({ enum: DIRECT_UPLOAD_MIME_TYPES, description: 'Tipo do arquivo (vídeo MP4/MOV ou PDF)' })
  @IsIn(DIRECT_UPLOAD_MIME_TYPES)
  mimeType: string

  @ApiProperty({ description: 'Tamanho exato do arquivo em bytes (vídeo até 100 MB, PDF até 50 MB)' })
  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  sizeBytes: number
}

export class CompleteUploadDto {
  @ApiProperty({ description: 'Chave devolvida pelo pedido de envio (reports/<id>.mp4|mov|pdf)' })
  @Matches(/^reports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|pdf)$/i)
  key: string
}
