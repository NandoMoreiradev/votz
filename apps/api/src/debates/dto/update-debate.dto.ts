import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator'

export class UpdateDebateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledFor?: string

  @ApiPropertyOptional({ description: 'URL da gravação pós-debate' })
  @IsOptional()
  @IsUrl()
  recordingUrl?: string

  @ApiPropertyOptional({ description: 'Segundos mínimos entre mensagens no chat (padrão: 5)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  chatCooldownSecs?: number
}
