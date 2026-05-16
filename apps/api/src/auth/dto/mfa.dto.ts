import { IsString, Length, IsNotEmpty } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class MfaCodeDto {
  @ApiProperty({ description: '6-digit TOTP code or 10-char backup code' })
  @IsString()
  @IsNotEmpty()
  code: string
}

export class MfaVerifyLoginDto {
  @ApiProperty({ description: 'Temporary MFA token received after password validation' })
  @IsString()
  @IsNotEmpty()
  mfaToken: string

  @ApiProperty({ description: '6-digit TOTP code or 10-char backup code' })
  @IsString()
  @IsNotEmpty()
  code: string
}
