import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { AD_REVIEW_LIMITS } from '@votz/shared-types'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class AdReviewQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING'

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20
}

export class AdReviewDecisionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'], { message: 'Escolha aprovar ou recusar.' })
  decision: 'APPROVED' | 'REJECTED'

  @ApiPropertyOptional({ maxLength: AD_REVIEW_LIMITS.REASON_MAX, description: 'Obrigatório ao recusar: o anunciante lê este motivo.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(AD_REVIEW_LIMITS.REASON_MAX, { message: `O motivo pode ter até ${AD_REVIEW_LIMITS.REASON_MAX} caracteres.` })
  reason?: string
}
