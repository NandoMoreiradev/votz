import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(300)
  website?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  logoUrl?: string

  @ApiPropertyOptional({ description: 'Capa do perfil (ideal 1500x500, proporção 3:1). Envie antes por POST /storage/upload/cover.' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(500)
  coverUrl?: string
}
