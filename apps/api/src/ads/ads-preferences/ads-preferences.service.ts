import { Injectable } from '@nestjs/common'
import {
  AD_PERSONALIZATION_CONSENT_VERSION,
  ageBandOf,
  isAdInterestId,
  type AdInterestId,
  type AdPreferencesView,
  type UserGender,
} from '@votz/shared-types'
import { AdsPreferencesRepository } from './ads-preferences.repository'
import { UpdateAdPreferencesDto } from './dto/update-ad-preferences.dto'

@Injectable()
export class AdsPreferencesService {
  constructor(private readonly repo: AdsPreferencesRepository) {}

  /** Sem registro, vale o padrão: personalização desligada e nenhum interesse. */
  async get(userId: string): Promise<AdPreferencesView> {
    const [preference, demographics] = await Promise.all([this.repo.findPreference(userId), this.repo.findDemographics(userId)])
    return {
      personalizationConsent: preference?.personalizationConsent ?? false,
      consentAt: preference?.consentAt?.toISOString() ?? null,
      interests: (preference?.interests ?? []).filter(isAdInterestId) as AdInterestId[],
      // Só a faixa; a data de nascimento nunca sai daqui.
      ageBand: ageBandOf(demographics?.birthDate),
      gender: (demographics?.gender as UserGender | null | undefined) ?? null,
    }
  }

  async update(userId: string, dto: UpdateAdPreferencesDto): Promise<AdPreferencesView> {
    const current = await this.repo.findPreference(userId)
    const data: Parameters<AdsPreferencesRepository['upsert']>[1] = {}

    if (dto.personalizationConsent !== undefined) {
      data.personalizationConsent = dto.personalizationConsent
      // Registra data e versão só quando a pessoa liga de verdade; salvar de novo já ligado não troca a data.
      if (dto.personalizationConsent && !current?.personalizationConsent) {
        data.consentAt = new Date()
        data.consentVersion = AD_PERSONALIZATION_CONSENT_VERSION
      }
      if (!dto.personalizationConsent) {
        data.consentAt = null
        data.consentVersion = null
      }
    }
    if (dto.interests !== undefined) data.interests = [...new Set(dto.interests)]

    if (Object.keys(data).length) await this.repo.upsert(userId, data)
    return this.get(userId)
  }
}
