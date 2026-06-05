import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class CreateQuestionDto {
  @ApiProperty({ example: 'Qual é seu plano concreto para reduzir a violência em 12 meses?' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  text: string
}
