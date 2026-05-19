import { IsString, IsNotEmpty, MaxLength, IsOptional, IsEnum } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ApiKeyTier } from '@prisma/client'

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Portal de Notícias XYZ', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string

  @ApiPropertyOptional({ enum: ApiKeyTier, default: ApiKeyTier.FREE })
  @IsOptional()
  @IsEnum(ApiKeyTier)
  tier?: ApiKeyTier
}
