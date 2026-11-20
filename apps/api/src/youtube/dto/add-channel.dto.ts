import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class AddChannelDto {
  @ApiProperty({
    example: 'https://www.youtube.com/@canaldojoao',
    description: 'Link do canal (/@nome ou /channel/UC…), "@nome" ou o id do canal',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  channel: string
}
