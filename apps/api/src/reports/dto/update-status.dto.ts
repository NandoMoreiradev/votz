import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength, ArrayMaxSize } from 'class-validator'

export enum UpdatableStatus {
  UNDER_REVIEW = 'UNDER_REVIEW',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  ARCHIVED = 'ARCHIVED',
}

export class UpdateStatusDto {
  @ApiPropertyOptional({ enum: UpdatableStatus, description: 'Omitir para postar atualização sem trocar o status' })
  @IsOptional()
  @IsEnum(UpdatableStatus)
  status?: UpdatableStatus

  @ApiPropertyOptional({ example: 'Equipe despachada para reparo na próxima semana' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  content: string

  @ApiPropertyOptional({ type: [String], description: 'URLs de mídia já enviadas ao R2 (máx. 4)' })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(4)
  media?: string[]
}
