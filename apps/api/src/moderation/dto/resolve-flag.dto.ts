import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator'

export type ResolveFlagAction = 'DISMISS' | 'REMOVE_CONTENT'

export class ResolveFlagDto {
  @ApiProperty({ enum: ['DISMISS', 'REMOVE_CONTENT'], description: 'Decisão da moderação' })
  @IsIn(['DISMISS', 'REMOVE_CONTENT'])
  action: ResolveFlagAction

  @ApiProperty({
    minLength: 10,
    maxLength: 500,
    description: 'Observação da moderação (10 a 500 caracteres)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  note: string
}
