import { ApiProperty } from '@nestjs/swagger'
import { Equals, IsBoolean, IsString } from 'class-validator'
import { MIN_AGE, PRIVACY_VERSION, TERMS_VERSION } from '@votz/shared-types'

export class AcceptConsentDto {
  @ApiProperty({ example: TERMS_VERSION, description: 'Versão dos Termos de Uso aceitos' })
  @IsString()
  acceptedTermsVersion: string

  @ApiProperty({ example: PRIVACY_VERSION, description: 'Versão da Política de Privacidade aceita' })
  @IsString()
  acceptedPrivacyVersion: string

  @ApiProperty({ example: true, description: `Confirmação de idade mínima (${MIN_AGE} anos)` })
  @IsBoolean({ message: `É preciso ter ${MIN_AGE} anos ou mais para criar uma conta.` })
  @Equals(true, { message: `É preciso ter ${MIN_AGE} anos ou mais para continuar.` })
  confirmAge18: boolean
}
