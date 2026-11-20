// Estados e municípios oficiais (IBGE). A mesma fonte que a API do Votz usa para cadastrar as prefeituras,
// então o nome escolhido aqui é o nome que a API reconhece.
export const UF_LIST = [
  { uf: 'AC', name: 'Acre' }, { uf: 'AL', name: 'Alagoas' }, { uf: 'AP', name: 'Amapá' }, { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' }, { uf: 'CE', name: 'Ceará' }, { uf: 'DF', name: 'Distrito Federal' }, { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' }, { uf: 'MA', name: 'Maranhão' }, { uf: 'MT', name: 'Mato Grosso' }, { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' }, { uf: 'PA', name: 'Pará' }, { uf: 'PB', name: 'Paraíba' }, { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' }, { uf: 'PI', name: 'Piauí' }, { uf: 'RJ', name: 'Rio de Janeiro' }, { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' }, { uf: 'RO', name: 'Rondônia' }, { uf: 'RR', name: 'Roraima' }, { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' }, { uf: 'SE', name: 'Sergipe' }, { uf: 'TO', name: 'Tocantins' },
] as const

/** Compara nomes sem olhar maiúsculas, acentos, hífen ou apóstrofo ("Santa Bárbara d'Oeste" = "SANTA BARBARA D OESTE"). */
export function placeKey(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Nome oficial da cidade na lista, ou undefined quando ela não existe naquele estado. */
export function findCity(cities: readonly string[], name?: string | null) {
  const key = placeKey(name)
  return key ? cities.find((city) => placeKey(city) === key) : undefined
}

/** Filtro da busca na lista: ignora acentos e maiúsculas; quem começa com o texto vem primeiro. */
export function filterPlaces(places: readonly string[], search: string) {
  const key = placeKey(search)
  if (!key) return places
  const starts: string[] = []
  const contains: string[] = []
  for (const place of places) {
    const candidate = placeKey(place)
    if (candidate.startsWith(key)) starts.push(place)
    else if (candidate.includes(key)) contains.push(place)
  }
  return [...starts, ...contains]
}

interface IbgeRow { 'municipio-nome'?: unknown }

export function parseCities(rows: unknown): string[] {
  if (!Array.isArray(rows)) return []
  const names = rows.map((row) => (row as IbgeRow)?.['municipio-nome']).filter((name): name is string => typeof name === 'string' && !!name.trim())
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export async function fetchCities(uf: string, signal?: AbortSignal): Promise<string[]> {
  if (!UF_LIST.some((item) => item.uf === uf)) throw new Error('Escolha o estado primeiro.')
  const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?view=nivelado`, { signal })
  if (!response.ok) throw new Error('Não foi possível carregar as cidades agora. Tente de novo.')
  const cities = parseCities(await response.json().catch(() => null))
  if (!cities.length) throw new Error('Não foi possível carregar as cidades agora. Tente de novo.')
  return cities
}
