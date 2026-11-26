import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import {
  SurveyDistributionMode,
  SurveyKind,
  SurveyMethodologyType,
  SurveyOrigin,
  SurveyQuestionType,
  SurveyResultsVisibility,
  SurveyReviewStatus,
  SurveyScope,
  SurveyStatus,
  SurveyVerificationLevel,
} from '@prisma/client'
import { SURVEY_DEFAULTS } from '@votz/shared-types'

export class CreateSurveyOptionDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label: string

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitle?: string

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(500)
  imageUrl?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  politicianId?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPinnedBottom?: boolean
}

export class CreateSurveyQuestionDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  prompt: string

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  helpText?: string

  @ApiPropertyOptional({ enum: SurveyQuestionType, default: SurveyQuestionType.SINGLE_CHOICE })
  @IsOptional()
  @IsEnum(SurveyQuestionType)
  type?: SurveyQuestionType

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxSelections?: number

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  randomizeOptions?: boolean

  @ApiProperty({ type: [CreateSurveyOptionDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(SURVEY_DEFAULTS.MAX_OPTIONS_PER_QUESTION)
  @ValidateNested({ each: true })
  @Type(() => CreateSurveyOptionDto)
  options: CreateSurveyOptionDto[]
}

export class CreateSurveyDto {
  @ApiProperty({ maxLength: 180 })
  @IsString()
  @MinLength(5)
  @MaxLength(180)
  title: string

  @ApiPropertyOptional({ maxLength: 120, description: 'Slug opcional (gerado do título se omitido)' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(120)
  slug?: string

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  subtitle?: string

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description: string

  @ApiProperty({ enum: SurveyKind })
  @IsEnum(SurveyKind)
  kind: SurveyKind

  @ApiPropertyOptional({ enum: SurveyOrigin, default: SurveyOrigin.VOTZ })
  @IsOptional()
  @IsEnum(SurveyOrigin)
  origin?: SurveyOrigin

  @ApiPropertyOptional({ enum: SurveyDistributionMode, default: SurveyDistributionMode.OPEN })
  @IsOptional()
  @IsEnum(SurveyDistributionMode)
  distributionMode?: SurveyDistributionMode

  @ApiPropertyOptional({ enum: SurveyMethodologyType, default: SurveyMethodologyType.OPEN_PANEL })
  @IsOptional()
  @IsEnum(SurveyMethodologyType)
  methodologyType?: SurveyMethodologyType

  @ApiPropertyOptional({ enum: SurveyScope, default: SurveyScope.NATIONAL })
  @IsOptional()
  @IsEnum(SurveyScope)
  scope?: SurveyScope

  @ApiPropertyOptional({ minLength: 2, maxLength: 2 })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  targetState?: string

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetCity?: string

  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  targetIbgeCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sponsorEntityId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instituteId?: string

  @ApiPropertyOptional({ maxLength: 120, description: 'Chave de tema/cargo para quarentena entre institutos e comparador' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  topicKey?: string

  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  cooldownDays?: number

  @ApiPropertyOptional({ minimum: 10, maximum: 500000 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500000)
  targetSampleSize?: number

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  partnerName?: string

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(500)
  partnerLogoUrl?: string

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  contractorName?: string

  @ApiPropertyOptional({ minimum: 0.1, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(20)
  marginOfError?: number

  @ApiPropertyOptional({ minimum: 80, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(80)
  @Max(99)
  confidenceLevel?: number

  @ApiPropertyOptional({ enum: SurveyVerificationLevel })
  @IsOptional()
  @IsEnum(SurveyVerificationLevel)
  verificationLevel?: SurveyVerificationLevel

  @ApiPropertyOptional({ minimum: 0, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  minAccountAgeDays?: number

  @ApiPropertyOptional({ enum: SurveyResultsVisibility })
  @IsOptional()
  @IsEnum(SurveyResultsVisibility)
  resultsVisibility?: SurveyResultsVisibility

  @ApiPropertyOptional({ minimum: 10, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(100000)
  minQuorumToPublish?: number

  @ApiPropertyOptional({ minimum: 10, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500)
  kAnonymityThreshold?: number

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  featuredInFeed?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isElectoral?: boolean

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tseRegistrationCode?: string

  @ApiPropertyOptional({ maxLength: 140 })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  statisticianName?: string

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  statisticianConre?: string

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  methodologyNote: string

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  disclaimerText: string

  @ApiProperty({ type: [CreateSurveyQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SURVEY_DEFAULTS.MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => CreateSurveyQuestionDto)
  questions: CreateSurveyQuestionDto[]
}

export class UpdateSurveyDto {
  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(180)
  title?: string

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  subtitle?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  featuredInFeed?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tseRegistrationCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(140)
  statisticianName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  statisticianConre?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  methodologyNote?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  disclaimerText?: string
}

export class SubmitSurveyVoteDto {
  @ApiProperty({
    description: 'Mapa { [questionId]: optionIds[] } com as escolhas da cédula anônima',
    example: { 'q-uuid': ['opt-uuid'] },
  })
  @IsObject()
  answers: Record<string, string[]>
}

export class CancelSurveyDto {
  @ApiProperty({ minLength: 5, maxLength: 1000 })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string
}

export class ListSurveysQueryDto {
  @ApiPropertyOptional({ enum: SurveyStatus })
  @IsOptional()
  @IsEnum(SurveyStatus)
  status?: SurveyStatus

  @ApiPropertyOptional({ enum: SurveyKind })
  @IsOptional()
  @IsEnum(SurveyKind)
  kind?: SurveyKind

  @ApiPropertyOptional({ enum: SurveyScope })
  @IsOptional()
  @IsEnum(SurveyScope)
  scope?: SurveyScope

  @ApiPropertyOptional({ minLength: 2, maxLength: 2 })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string
}

export class ReviewSurveyDto {
  @ApiProperty({ enum: SurveyReviewStatus })
  @IsEnum(SurveyReviewStatus)
  reviewStatus: SurveyReviewStatus

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string
}

export class DrawSampleDto {
  @ApiProperty({ minimum: 1, maximum: 50000, description: 'Quantidade de cidadãos a sortear respeitando a quarentena' })
  @IsInt()
  @Min(1)
  @Max(50000)
  count: number

  @ApiPropertyOptional({ minimum: 1, maximum: 90, default: 14 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number
}

export class SubmitEntitySurveyDto {
  @ApiProperty({ maxLength: 180 })
  @IsString()
  @MinLength(5)
  @MaxLength(180)
  title: string

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  subtitle?: string

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string

  @ApiProperty({ type: [CreateSurveyQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateSurveyQuestionDto)
  questions: CreateSurveyQuestionDto[]
}

export class CreateInstituteDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName: string

  @ApiPropertyOptional({ maxLength: 18 })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(500)
  logoUrl?: string

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(300)
  website?: string

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @ApiPropertyOptional({ maxLength: 140 })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  statisticianLead?: string

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  conreLead?: string

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  verified?: boolean
}
