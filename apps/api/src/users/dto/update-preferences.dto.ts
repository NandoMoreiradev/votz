import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator'

export class UpdatePreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reportUpdates?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reportComments?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  officialResponses?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  localSurges?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  officialSurveys?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mentions?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  weeklyDigest?: boolean

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 23 })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStart?: number | null

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 23 })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEnd?: number | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  defaultAnonymousReports?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publicActivityVisible?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptPressContact?: boolean
}
