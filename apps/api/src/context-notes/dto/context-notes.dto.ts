import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { ContextNoteKind, ContextNoteRatingValue, ContextNoteStatus } from '@prisma/client'
import { CONTEXT_NOTE_SOURCES_MAX, CONTEXT_NOTE_TEXT_MAX, ContextNoteTargetType } from '@votz/shared-types'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class ContextNoteTargetDto {
  @ApiProperty({ enum: ContextNoteTargetType })
  @IsEnum(ContextNoteTargetType)
  targetType: ContextNoteTargetType

  @ApiProperty()
  @IsUUID()
  targetId: string
}

export class CreateContextNoteDto extends ContextNoteTargetDto {
  @ApiProperty({ enum: ContextNoteKind })
  @IsEnum(ContextNoteKind)
  kind: ContextNoteKind

  @ApiProperty({ maxLength: CONTEXT_NOTE_TEXT_MAX })
  @Transform(trim)
  @IsString()
  @MaxLength(CONTEXT_NOTE_TEXT_MAX * 2)
  text: string

  @ApiProperty({ description: 'Links de fonte (pelo menos 1).', maxItems: CONTEXT_NOTE_SOURCES_MAX })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONTEXT_NOTE_SOURCES_MAX)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  sources: string[]
}

export class RateContextNoteDto {
  @ApiProperty({ enum: ContextNoteRatingValue })
  @IsEnum(ContextNoteRatingValue)
  value: ContextNoteRatingValue

  @ApiPropertyOptional({ description: 'Motivos (lista fechada, até 3).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  reasons?: string[]
}

export class JoinContributorDto {
  @ApiProperty({ description: 'A pessoa leu e aceitou o termo do colaborador.' })
  @IsBoolean()
  @Equals(true, { message: 'É preciso aceitar o termo do colaborador.' })
  acceptTerms: boolean

  @ApiProperty({ description: 'Versão do termo que a pessoa viu (CONTEXT_CONTRIBUTOR_TERMS_VERSION).' })
  @IsString()
  @MaxLength(30)
  termsVersion: string
}

export class ShownNotesQueryDto {
  @ApiPropertyOptional({ description: 'IDs de publicações separados por vírgula (até 50).' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  postIds?: string

  @ApiPropertyOptional({ description: 'IDs de relatos separados por vírgula (até 50).' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reportIds?: string
}

export class RemoveContextNoteDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Explique o motivo em pelo menos 10 caracteres.' })
  @MaxLength(500)
  reason: string
}

export class AdminListContextNotesDto {
  @ApiPropertyOptional({ enum: ContextNoteStatus })
  @IsOptional()
  @IsEnum(ContextNoteStatus)
  status?: ContextNoteStatus

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}
