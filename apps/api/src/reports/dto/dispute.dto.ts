import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator'
import { REPORT_LIFECYCLE_LIMITS as L } from '@votz/shared-types'

export class DisputeDto {
  @ApiProperty({ example: 'O buraco continua lá. Tirei fotos ontem.', minLength: L.DISPUTE_MIN, maxLength: L.DISPUTE_MAX })
  @IsString()
  @MinLength(L.DISPUTE_MIN, { message: `Explique em pelo menos ${L.DISPUTE_MIN} caracteres.` })
  @MaxLength(L.DISPUTE_MAX, { message: `Use no máximo ${L.DISPUTE_MAX} caracteres.` })
  reason: string

  @ApiPropertyOptional({ type: [String], description: 'URLs de evidências (upload via /storage/upload/report-media)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.DISPUTE_EVIDENCE_MAX)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  evidence?: string[]
}
