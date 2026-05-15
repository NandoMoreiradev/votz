import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength, Matches } from 'class-validator'
import { Transform } from 'class-transformer'

export class RegisterDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @MinLength(2)
  nome: string

  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email: string

  @ApiProperty({ example: 'Senha@123' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'Deve conter ao menos uma letra maiúscula' })
  @Matches(/[0-9]/, { message: 'Deve conter ao menos um número' })
  senha: string
}
