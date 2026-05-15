import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'

export class CreateCommentDto {
  @ApiProperty({ example: 'This road has been broken for months.' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  content: string

  @ApiPropertyOptional({ description: 'Parent comment ID for replies' })
  @IsOptional()
  @IsUUID()
  parentId?: string
}
