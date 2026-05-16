import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength, Matches } from 'class-validator'
import { Transform } from 'class-transformer'

export class RegisterDto {
  @ApiProperty({ example: 'John Silva' })
  @IsString()
  @MinLength(2)
  name: string

  @ApiProperty({ example: 'john@email.com' })
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email: string

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'Must contain at least one uppercase letter' })
  @Matches(/[0-9]/, { message: 'Must contain at least one number' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Must contain at least one special character' })
  password: string
}
