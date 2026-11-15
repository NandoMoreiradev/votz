import { IsString, IsNotEmpty, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Portal de Notícias XYZ', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string
}
