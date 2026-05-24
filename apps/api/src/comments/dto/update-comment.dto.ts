import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class UpdateCommentDto {
  @ApiProperty({ example: 'Texto corrigido do comentário' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string
}
