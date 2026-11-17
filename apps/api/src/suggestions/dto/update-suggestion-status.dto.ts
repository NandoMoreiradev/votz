import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { SuggestionStatus } from '@prisma/client'

export class UpdateSuggestionStatusDto {
  @ApiProperty({ enum: SuggestionStatus })
  @IsEnum(SuggestionStatus)
  status: SuggestionStatus

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'A resposta oficial pode ter no máximo 1000 caracteres.' })
  adminNote?: string
}
