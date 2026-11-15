import { ApiProperty } from '@nestjs/swagger'
import { ApiKeyTier } from '@prisma/client'
import { Transform } from 'class-transformer'
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator'

export class SetApiKeyTierDto {
  @ApiProperty({
    enum: ApiKeyTier,
    description: 'Novo nível da API key (FREE ou PAID)',
  })
  @IsEnum(ApiKeyTier)
  tier: ApiKeyTier

  @ApiProperty({
    minLength: 10,
    maxLength: 500,
    description: 'Motivo da alteração de nível da API key (entre 10 e 500 caracteres)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string
}
