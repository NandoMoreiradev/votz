// Regras de localização do relato. Espelham o web (CreateReport + CepInput) e o DTO da API
// (city 1–100, state = UF de 2 letras, neighborhood ≤ 100, typedAddress ≤ 300).

export interface LocationDraft {
  cep: string
  street: string
  neighborhood: string
  city: string
  state: string
  latitude?: number
  longitude?: number
}

export const emptyLocation: LocationDraft = { cep: '', street: '', neighborhood: '', city: '', state: '' }

export const digitsOnly = (value: string) => value.replace(/\D/g, '')
export const normalizeUf = (value: string) => value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
export const isUf = (value: string) => /^[A-Z]{2}$/.test(value)

export function formatCep(value: string) {
  const digits = digitsOnly(value).slice(0, 8)
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)}-${digits.slice(5)}`
}

const hasCoords = (draft: LocationDraft) => Number.isFinite(draft.latitude) && Number.isFinite(draft.longitude)

/** O CEP sozinho não é localização: só vale depois que a busca preenche cidade e UF. */
export function locationIsEmpty(draft: LocationDraft) {
  return !draft.street.trim() && !draft.neighborhood.trim() && !draft.city.trim() && !draft.state.trim() && !hasCoords(draft)
}

/** Mensagem em português simples, ou null quando a localização pode ser enviada. */
export function locationError(draft: LocationDraft): string | null {
  if (locationIsEmpty(draft)) return null
  if (!draft.city.trim()) return 'Informe a cidade para registrar o local, ou remova a localização.'
  if (!isUf(draft.state.trim().toUpperCase())) return 'Informe o estado com 2 letras (ex.: SP), ou remova a localização.'
  return null
}

/** Mesmo formato que o web envia: só campos preenchidos, nunca string vazia. */
export function buildLocationPayload(draft: LocationDraft) {
  if (locationIsEmpty(draft) || locationError(draft)) return {}
  const street = draft.street.trim()
  const neighborhood = draft.neighborhood.trim()
  const city = draft.city.trim()
  const state = draft.state.trim().toUpperCase()
  return {
    city,
    state,
    ...(neighborhood ? { neighborhood } : {}),
    ...(hasCoords(draft) ? { latitude: draft.latitude, longitude: draft.longitude } : {}),
    typedAddress: [street, neighborhood, city, state].filter(Boolean).join(', ').slice(0, 300),
  }
}

export interface CepResult { street: string; neighborhood: string; city: string; state: string; latitude?: number; longitude?: number }

const finiteOrUndefined = (value: unknown) => {
  const number = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN
  return Number.isFinite(number) && number !== 0 ? number : undefined
}

export function parseCepResponse(data: unknown): CepResult | null {
  if (!data || typeof data !== 'object') return null
  const source = data as { street?: unknown; neighborhood?: unknown; city?: unknown; state?: unknown; location?: { coordinates?: { latitude?: unknown; longitude?: unknown } } }
  const city = typeof source.city === 'string' ? source.city.trim() : ''
  const state = typeof source.state === 'string' ? source.state.trim().toUpperCase() : ''
  if (!city || !isUf(state)) return null
  const latitude = finiteOrUndefined(source.location?.coordinates?.latitude)
  const longitude = finiteOrUndefined(source.location?.coordinates?.longitude)
  return {
    street: typeof source.street === 'string' ? source.street.trim() : '',
    neighborhood: typeof source.neighborhood === 'string' ? source.neighborhood.trim() : '',
    city, state,
    ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
  }
}

/** Mesma fonte do web (BrasilAPI). */
export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepResult> {
  const digits = digitsOnly(cep)
  if (digits.length !== 8) throw new Error('Digite os 8 números do CEP.')
  const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`, { signal })
  if (response.status === 404) throw new Error('CEP não encontrado. Confira os números ou informe o endereço à mão.')
  if (!response.ok) throw new Error('Não foi possível buscar o CEP agora. Informe o endereço à mão.')
  const result = parseCepResponse(await response.json().catch(() => null))
  if (!result) throw new Error('CEP sem cidade ou estado. Informe o endereço à mão.')
  return result
}

const UF_BY_NAME: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
  goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA', paraiba: 'PB',
  parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
}

/** O GPS devolve "SP" no Android e "São Paulo" no iOS: aceita os dois. */
export function ufFromRegion(region?: string | null) {
  const value = region?.trim() ?? ''
  if (isUf(value.toUpperCase()) && value.length === 2) return value.toUpperCase()
  return UF_BY_NAME[value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()] ?? ''
}

export interface GeocodeAddress { street?: string | null; name?: string | null; district?: string | null; subregion?: string | null; city?: string | null; region?: string | null }

/** Preenche os campos com o que o GPS descobriu e mantém as coordenadas. */
export function draftFromGps(coords: { latitude: number; longitude: number }, address?: GeocodeAddress | null): LocationDraft {
  return {
    cep: '',
    street: address?.street?.trim() || address?.name?.trim() || '',
    neighborhood: address?.district?.trim() || '',
    city: address?.city?.trim() || address?.subregion?.trim() || '',
    state: ufFromRegion(address?.region),
    latitude: coords.latitude,
    longitude: coords.longitude,
  }
}

/**
 * Mudar cidade ou UF invalida o ponto do GPS/CEP (o pino não pode ficar em outra cidade).
 * Mudar a UF também limpa a cidade: ela pertencia ao estado anterior.
 */
export function editLocation(draft: LocationDraft, field: 'street' | 'neighborhood' | 'city' | 'state', value: string): LocationDraft {
  const normalized = field === 'state' ? normalizeUf(value) : value
  const next = { ...draft, [field]: normalized }
  if (field === 'state' && normalized !== draft.state) next.city = ''
  if ((field === 'city' || field === 'state') && normalized !== draft[field]) {
    delete next.latitude
    delete next.longitude
  }
  return next
}
