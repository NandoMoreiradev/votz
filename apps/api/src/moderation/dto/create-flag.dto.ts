import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { FlagReason, FlagTargetType } from '@prisma/client'
import { Transform } from 'class-transformer'
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export class CreateFlagDto {
  @ApiProperty({ enum: FlagTargetType, description: 'Tipo do conteúdo sinalizado' })
  @IsEnum(FlagTargetType)
  targetType: FlagTargetType

  @ApiProperty({ description: 'ID do relato ou comentário sinalizado' })
  @IsUUID()
  targetId: string

  @ApiProperty({ enum: FlagReason, description: 'Motivo da sinalização' })
  @IsEnum(FlagReason)
  reason: FlagReason

  @ApiPropertyOptional({ maxLength: 500, description: 'Detalhes adicionais (opcional)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  details?: string
}
