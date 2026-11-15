import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator'
import { UserType } from '@votz/shared-types'

export class SetTypeDto {
  @ApiProperty({
    enum: UserType,
    description: 'Novo papel da conta (não aceita tipos organizacionais)',
  })
  @IsEnum(UserType)
  type: UserType

  @ApiProperty({
    minLength: 10,
    maxLength: 500,
    description: 'Motivo da alteração de papel (entre 10 e 500 caracteres)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string
}
