import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class SetStreamDto {
  @ApiProperty({ example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', description: 'Link da live no YouTube' })
  @IsString()
  @MinLength(11)
  @MaxLength(300)
  url: string
}

export class SetParticipantStreamDto {
  @ApiPropertyOptional({
    nullable: true,
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'Link da live do próprio debatedor. Envie null para tirar.',
  })
  @IsOptional()
  @IsString()
  @MinLength(11)
  @MaxLength(300)
  url?: string | null
}
