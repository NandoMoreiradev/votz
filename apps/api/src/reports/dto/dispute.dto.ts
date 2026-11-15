import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsOptional, IsString, IsUrl, MaxLength, MinLength, ArrayMaxSize } from 'class-validator'

export class DisputeDto {
  @ApiProperty({ example: 'O buraco continua lá. Tirei fotos ontem.', minLength: 20, maxLength: 500 })
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason: string

  @ApiPropertyOptional({ type: [String], description: 'URLs de evidências (upload via /storage/upload/report-media)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  evidence?: string[]
}
