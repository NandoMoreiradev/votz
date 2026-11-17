import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { SuggestionCategory } from '@prisma/client'

export class CreateSuggestionDto {
  @ApiProperty({ minLength: 5, maxLength: 150, example: 'Filtro por bairro no mapa de relatos' })
  @IsString()
  @MinLength(5, { message: 'O título deve ter pelo menos 5 caracteres.' })
  @MaxLength(150, { message: 'O título pode ter no máximo 150 caracteres.' })
  title: string

  @ApiProperty({ minLength: 15, maxLength: 2000 })
  @IsString()
  @MinLength(15, { message: 'Descreva a sugestão com pelo menos 15 caracteres.' })
  @MaxLength(2000, { message: 'A descrição pode ter no máximo 2000 caracteres.' })
  description: string

  @ApiProperty({ enum: SuggestionCategory, default: SuggestionCategory.IMPROVEMENT })
  @IsEnum(SuggestionCategory)
  category: SuggestionCategory
}
