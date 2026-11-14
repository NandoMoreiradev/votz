import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class DeleteCommentDto {
  @ApiPropertyOptional({
    minLength: 10,
    maxLength: 500,
    description: 'Motivo da remoção pela moderação (opcional)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string
}
