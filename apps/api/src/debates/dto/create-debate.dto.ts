import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { StreamProvider } from '@prisma/client'
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'

export class CreateDebateDto {
  @ApiProperty({ example: 'Debate sobre segurança pública no Rio de Janeiro' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string

  @ApiPropertyOptional({ example: 'Um debate aprofundado sobre os desafios de segurança...' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @ApiProperty({ example: '2026-07-15T20:00:00.000Z' })
  @IsDateString()
  scheduledFor: string

  @ApiProperty({ type: [String], description: 'IDs dos políticos convidados' })
  @IsArray()
  @IsUUID('4', { each: true })
  invites: string[]

  @ApiPropertyOptional({
    enum: StreamProvider,
    default: StreamProvider.YOUTUBE,
    description: 'Como o debate é transmitido. Novos debates usam a live do YouTube.',
  })
  @IsOptional()
  @IsEnum(StreamProvider)
  streamProvider?: StreamProvider
}
