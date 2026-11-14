import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class DeleteReportDto {
  @ApiProperty({
    minLength: 10,
    maxLength: 500,
    description: 'Motivo da remoção do relato (10 a 500 caracteres)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string
}
