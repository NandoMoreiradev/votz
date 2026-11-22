import { ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional } from 'class-validator'
import { AD_INTEREST_IDS, AD_MAX_DECLARED_INTERESTS, type AdInterestId } from '@votz/shared-types'

export class UpdateAdPreferencesDto {
  @ApiPropertyOptional({ description: 'Liga ou desliga a personalização de anúncios (opt-in; padrão desligado)' })
  @IsOptional()
  @IsBoolean({ message: 'Informe se a personalização está ligada ou desligada.' })
  personalizationConsent?: boolean

  @ApiPropertyOptional({
    description: `Interesses escolhidos (até ${AD_MAX_DECLARED_INTERESTS}), da lista permitida. Lista vazia apaga todos.`,
    enum: AD_INTEREST_IDS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AD_MAX_DECLARED_INTERESTS, { message: `Escolha no máximo ${AD_MAX_DECLARED_INTERESTS} interesses.` })
  @ArrayUnique()
  @IsIn(AD_INTEREST_IDS as string[], { each: true, message: 'Um dos interesses não existe na lista.' })
  interests?: AdInterestId[]
}
