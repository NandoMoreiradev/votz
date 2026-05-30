import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'
import { Category, PropostaStatus } from '@votz/shared-types'

export class ListPropostasQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por político' })
  @IsUUID()
  @IsOptional()
  politicoId?: string

  @ApiPropertyOptional({ enum: PropostaStatus })
  @IsEnum(PropostaStatus)
  @IsOptional()
  status?: PropostaStatus

  @ApiPropertyOptional({ enum: Category })
  @IsEnum(Category)
  @IsOptional()
  categoria?: Category

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number

  @ApiPropertyOptional({ default: 20 })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Type(() => Number)
  limit?: number
}
