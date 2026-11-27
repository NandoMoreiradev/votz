import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator'
import { ArchiveReason, REPORT_LIFECYCLE_LIMITS as L } from '@votz/shared-types'

export enum UpdatableStatus {
  UNDER_REVIEW = 'UNDER_REVIEW',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  ARCHIVED = 'ARCHIVED',
}

export class UpdateStatusDto {
  @ApiPropertyOptional({ enum: UpdatableStatus, description: 'Omitir para postar atualização sem trocar o status' })
  @IsOptional()
  @IsEnum(UpdatableStatus)
  status?: UpdatableStatus

  @ApiPropertyOptional({ example: 'Equipe despachada para reparo na próxima semana' })
  @IsString()
  @MinLength(L.UPDATE_MIN, { message: `Escreva pelo menos ${L.UPDATE_MIN} caracteres.` })
  @MaxLength(L.UPDATE_MAX, { message: `Use no máximo ${L.UPDATE_MAX} caracteres.` })
  content: string

  @ApiPropertyOptional({ type: [String], description: 'URLs de mídia já enviadas (máx. 4). Resolver pede ao menos uma, ou noEvidence.' })
  @IsOptional()
  @IsArray()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  @ArrayMaxSize(L.MEDIA_MAX)
  media?: string[]

  @ApiPropertyOptional({ enum: ArchiveReason, description: 'Obrigatório ao arquivar' })
  @IsOptional()
  @IsEnum(ArchiveReason)
  archiveReason?: ArchiveReason

  @ApiPropertyOptional({ description: 'Ao resolver sem foto ou documento: o texto precisa explicar por quê' })
  @IsOptional()
  @IsBoolean()
  noEvidence?: boolean
}
