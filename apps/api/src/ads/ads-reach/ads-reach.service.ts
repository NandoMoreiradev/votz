import { Injectable } from '@nestjs/common'
import { adAudienceIsPersonal, describeAdReach, type AdReachEstimate, type AdReachEstimateInput } from '@votz/shared-types'
import { AdsReachRepository } from './ads-reach.repository'
import { buildAudienceWhere, matchCities, withoutHoldout } from './reach-rules'

/** O mesmo público dá a mesma resposta por este tempo: o passo a passo pergunta a cada mudança de campo. */
const CACHE_TTL_MS = 60_000
const CACHE_MAX = 200

/**
 * Estimativa de alcance do público escolhido, para o anunciante decidir antes de criar a campanha. Conta cadastros
 * (cidade ou estado, e, para público personalizado, só quem ligou a personalização), tira o grupo de controle e devolve
 * uma **faixa**, nunca o número exato; público abaixo de `AD_REACH.MIN_AUDIENCE` vira "poucas pessoas".
 */
@Injectable()
export class AdsReachService {
  private readonly cache = new Map<string, { at: number; value: AdReachEstimate }>()

  constructor(private readonly repo: AdsReachRepository) {}

  async estimate(input: AdReachEstimateInput, now = new Date()): Promise<AdReachEstimate> {
    const clean: AdReachEstimateInput = {
      states: [...new Set(input.states.map((state) => state.trim().toUpperCase()))].sort(),
      cities: [...new Set(input.cities.map((city) => city.trim()).filter(Boolean))].sort(),
      // No público automático só a região conta (a escolha fina é do Votz): interesses, idade e gênero são ignorados.
      interests: input.automaticAudience ? [] : [...input.interests].sort(),
      ageBands: input.automaticAudience ? [] : [...input.ageBands].sort(),
      genders: input.automaticAudience ? [] : [...input.genders].sort(),
      automaticAudience: input.automaticAudience,
    }
    const key = JSON.stringify(clean)
    const cached = this.cache.get(key)
    if (cached && now.getTime() - cached.at < CACHE_TTL_MS) return cached.value

    const where = buildAudienceWhere(clean, now)
    const total = clean.cities.length ? matchCities(await this.repo.countByCity(where), clean.cities) : await this.repo.count(where)
    const value = describeAdReach(withoutHoldout(total), adAudienceIsPersonal(clean))

    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string)
    this.cache.set(key, { at: now.getTime(), value })
    return value
  }
}
