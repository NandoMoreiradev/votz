import { ArchiveReason, Category, ReportStatus } from '@prisma/client'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class MandateInboxQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string

  @IsOptional()
  @IsIn(['pressure', 'oldest', 'recent'])
  sortBy?: 'pressure' | 'oldest' | 'recent'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number

  // Filtros avançados (Plano MANDATO / GESTAO+)
  @IsOptional()
  @IsEnum(Category)
  category?: Category

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cell7?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  stalledDays?: number

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyUnanswered?: boolean

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyAdvocated?: boolean
}

export class QuickRespondDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string

  @IsOptional()
  @IsUUID()
  templateId?: string

  /** Só o destinatário muda status, e só para estes valores (as transições valem como na página do relato). */
  @IsOptional()
  @IsIn(['UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'ARCHIVED'])
  newStatus?: ReportStatus

  /** true = avocar junto. Omitido ou false = não avoca. */
  @IsOptional()
  @IsBoolean()
  advocate?: boolean

  @IsOptional()
  @IsArray()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  @ArrayMaxSize(4)
  media?: string[]

  /** Ao resolver sem foto ou documento (a mensagem precisa explicar). */
  @IsOptional()
  @IsBoolean()
  noEvidence?: boolean

  @IsOptional()
  @IsEnum(ArchiveReason)
  archiveReason?: ArchiveReason
}

export class UpdateMandateGoalDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  monthlyGoal!: number | null
}

export class CreateReplyTemplateDto {
  @IsString()
  @MaxLength(120)
  title!: string

  @IsString()
  @MaxLength(2000)
  body!: string

  @IsOptional()
  @IsEnum(Category)
  category?: Category
}

export class UpdateReplyTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string

  @IsOptional()
  @IsEnum(Category)
  category?: Category | null
}

export class CreateReportTagDto {
  @IsString()
  @MaxLength(40)
  label!: string

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'Cor deve estar no formato hexadecimal (#RRGGBB)',
  })
  color?: string
}

export class CreateReportNoteDto {
  @IsString()
  @MaxLength(2000)
  content!: string
}

export class UpdateDigestSettingsDto {
  @IsBoolean()
  digestEnabled!: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  digestDayOfWeek?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  digestHour?: number

  @IsOptional()
  @IsBoolean()
  legalBasisAccepted?: boolean
}

export class UpdateOnboardingDto {
  @IsOptional()
  @IsBoolean()
  dismissed?: boolean

  @IsOptional()
  @IsBoolean()
  confirmTerritory?: boolean
}

export class UnsubscribeDigestDto {
  @IsString()
  @MaxLength(128)
  token!: string
}
