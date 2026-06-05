import { ApiProperty } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator'

export class CreatePollDto {
  @ApiProperty({ example: 'Qual proposta você apoia?' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  question: string

  @ApiProperty({ type: [String], example: ['Reforma tributária', 'Reforma administrativa'] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  options: string[]
}
