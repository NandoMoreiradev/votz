import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class CreateMessageDto {
  @ApiProperty({ example: 'Concordo com o ponto levantado sobre educação.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text: string
}
