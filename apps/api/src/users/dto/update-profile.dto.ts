import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator'

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John Silva' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string

  @ApiPropertyOptional({ example: 'Civic activist from São Paulo.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string
}
