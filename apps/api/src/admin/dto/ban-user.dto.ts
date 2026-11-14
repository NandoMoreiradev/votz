import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator'

export class SetBanDto {
  @ApiProperty({ description: 'true para banir, false para desbanir' })
  @IsBoolean()
  banned: boolean

  @ApiPropertyOptional({
    minLength: 10,
    maxLength: 500,
    description: 'Motivo do banimento (obrigatório quando banned = true, entre 10 e 500 caracteres)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o) => o.banned === true || (o.reason !== undefined && o.reason !== null && o.reason !== ''))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string
}
