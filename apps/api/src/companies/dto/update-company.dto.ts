import { IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator'
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

  @ApiPropertyOptional({ minimum: 1, maximum: 720, description: 'Prazo comprometido de resposta em horas (SLA)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  slaHours?: number

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
