import { ApiPropertyOptional } from '@nestjs/swagger'
import { DebateStatus } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

export class ListDebatesDto {
  @ApiPropertyOptional({ enum: DebateStatus })
  @IsOptional()
  @IsEnum(DebateStatus)
  status?: DebateStatus

  @ApiPropertyOptional({ description: 'Filtrar por ID de político participante' })
  @IsOptional()
  @IsUUID()
  politicianId?: string

  @ApiPropertyOptional({ description: 'Retornar apenas debates futuros (scheduledFor > now)' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  upcoming?: boolean

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number
}
