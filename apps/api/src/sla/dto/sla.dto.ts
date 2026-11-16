import { ApiPropertyOptional } from '@nestjs/swagger'
import { Category } from '@votz/shared-types'
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { SlaHoursDto } from '../../entities/dto/update-entity.dto'

export type SlaQueueUrgency =
  | 'ALL'
  | 'BREACHED'
  | 'DUE_TODAY'
  | 'AT_RISK'
  | 'ON_TIME'
  | 'RESPONDED'
  | 'RESPONDED_ON_TIME'
  | 'RESPONDED_LATE'
  | 'NO_SLA'
export type SlaQueueSort = 'due_asc' | 'pressure_desc' | 'newest'

export class SlaQueueFilterDto {
  @ApiPropertyOptional({
    enum: [
      'ALL',
      'BREACHED',
      'DUE_TODAY',
      'AT_RISK',
      'ON_TIME',
      'RESPONDED',
      'RESPONDED_ON_TIME',
      'RESPONDED_LATE',
      'NO_SLA',
    ],
  })
  @IsOptional()
  @IsIn([
    'ALL',
    'BREACHED',
    'DUE_TODAY',
    'AT_RISK',
    'ON_TIME',
    'RESPONDED',
    'RESPONDED_ON_TIME',
    'RESPONDED_LATE',
    'NO_SLA',
  ])
  urgency?: SlaQueueUrgency

  @ApiPropertyOptional({ enum: Category })
  @IsOptional()
  @IsEnum(Category)
  category?: Category

  @ApiPropertyOptional({ description: 'ALL, MINE, UNASSIGNED ou UUID de membro' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignee?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string

  @ApiPropertyOptional({ enum: ['due_asc', 'pressure_desc', 'newest'] })
  @IsOptional()
  @IsIn(['due_asc', 'pressure_desc', 'newest'])
  sortBy?: SlaQueueSort

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export class AssignReportDto {
  @ApiPropertyOptional({ nullable: true, description: 'UUID do membro ativo (null remove atribuição)' })
  @IsOptional()
  @IsUUID()
  assigneeUserId?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string
}

export class UpdateSlaPolicyDto {
  @ApiPropertyOptional({ type: SlaHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SlaHoursDto)
  slaHours?: SlaHoursDto

  @ApiPropertyOptional({ type: SlaHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SlaHoursDto)
  resolutionSlaHours?: SlaHoursDto

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  slaEscalationHours?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoMonthlyReportEnabled?: boolean

  @ApiPropertyOptional({
    description: 'Quando true, recalcula explicitamente o prazo dos relatos abertos sem resposta',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  recalculateOpen?: boolean
}

export class SlaPerformanceQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string

  @ApiPropertyOptional({ example: '2026-11-15' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string

  @ApiPropertyOptional({ enum: Category })
  @IsOptional()
  @IsEnum(Category)
  category?: Category
}
