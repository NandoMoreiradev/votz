import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class AdFraudQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'CONFIRMED', 'DISMISSED'], default: 'OPEN' })
  @IsOptional()
  @IsIn(['OPEN', 'CONFIRMED', 'DISMISSED'])
  status?: 'OPEN' | 'CONFIRMED' | 'DISMISSED' = 'OPEN'

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

export class AdFraudResolveDto {
  @ApiProperty({ enum: ['CONFIRMED', 'DISMISSED'], description: 'CONFIRMED: era tráfego inválido. DISMISSED: era tráfego normal (o anúncio pausado volta).' })
  @IsIn(['CONFIRMED', 'DISMISSED'], { message: 'Escolha confirmar ou descartar.' })
  resolution: 'CONFIRMED' | 'DISMISSED'

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'A nota pode ter até 500 caracteres.' })
  note?: string
}
