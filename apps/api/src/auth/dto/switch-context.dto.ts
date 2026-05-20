import { IsEnum, IsOptional, IsUUID } from 'class-validator'
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
}
