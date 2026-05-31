import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export type ContextType = 'personal' | 'entity' | 'politician' | 'company'

export class SwitchContextDto {
  @ApiProperty({ enum: ['personal', 'entity', 'politician', 'company'] })
  @IsEnum(['personal', 'entity', 'politician', 'company'])
  contextType: ContextType

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contextId?: string

  @ApiPropertyOptional({ description: 'Código TOTP de 6 dígitos — obrigatório para contextos elevados (politician, entity, company)' })
  @IsOptional()
  @IsString()
  @Length(6, 10)
  mfaCode?: string
}
