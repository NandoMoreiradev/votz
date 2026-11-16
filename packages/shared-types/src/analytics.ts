export const ANALYTICS_DEFINITION_VERSION = 'v1.1.2'
export const ANALYTICS_DEFINITION_DATE = '2026-11-16'
export const ANALYTICS_TIMEZONE = 'America/Sao_Paulo'
export const MIN_CELL_SIZE = 10
export const MAX_ANALYTICS_RANGE_MONTHS = 24
export const RECURRENCE_WINDOW_DAYS = 90
export const RECURRENCE_MIN_REPORTS = 2

/**
 * Limites superiores (em horas) para os 8 buckets de histograma de tempos:
 * [0-1h, 1-4h, 4-12h, 12-24h, 24-48h, 48h-7d (168h), 7d-30d (720h), >30d]
 */
export const RESPONSE_TIME_BUCKET_BOUNDS_HOURS = [1, 4, 12, 24, 48, 168, 720] as const

export const RESPONSE_TIME_BUCKET_LABELS = [
  'Até 1h',
  '1h a 4h',
  '4h a 12h',
  '12h a 24h',
  '24h a 48h',
  '2d a 7d',
  '7d a 30d',
  'Mais de 30d',
] as const

/**
 * Limites superiores para os 9 buckets de pressão (`pressureScore`):
 * [0-5, 5-10, 10-25, 25-50, 50-100, 100-250, 250-500, 500-1000, >1000]
 */
export const PRESSURE_BUCKET_BOUNDS = [5, 10, 25, 50, 100, 250, 500, 1000] as const

const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

/**
 * Normaliza cidade ou bairro para chave determinística de agrupamento territorial:
 * remove diacríticos, colapsa espaços e converte para minúsculas.
 */
export function normalizeLocationKey(value?: string | null): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function encodeGeohash7(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  precision = 7,
): string | null {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null
  }

  let latMin = -90
  let latMax = 90
  let lngMin = -180
  let lngMax = 180
  let isLng = true
  let bit = 0
  let ch = 0
  let hash = ''

  while (hash.length < precision) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2
      if (longitude >= mid) {
        ch = (ch << 1) | 1
        lngMin = mid
      } else {
        ch <<= 1
        lngMax = mid
      }
    } else {
      const mid = (latMin + latMax) / 2
      if (latitude >= mid) {
        ch = (ch << 1) | 1
        latMin = mid
      } else {
        ch <<= 1
        latMax = mid
      }
    }
    isLng = !isLng
    bit++
    if (bit === 5) {
      hash += GEOHASH_BASE32[ch]
      bit = 0
      ch = 0
    }
  }

  return hash
}

export interface GeohashCellBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
  centerLat: number
  centerLng: number
}

export function decodeGeohashBounds(geohash: string): GeohashCellBounds | null {
  if (!geohash || typeof geohash !== 'string') return null
  let latMin = -90
  let latMax = 90
  let lngMin = -180
  let lngMax = 180
  let isLng = true

  for (const c of geohash.toLowerCase()) {
    const idx = GEOHASH_BASE32.indexOf(c)
    if (idx === -1) return null
    for (let mask = 16; mask > 0; mask >>= 1) {
      if (isLng) {
        const mid = (lngMin + lngMax) / 2
        if (idx & mask) lngMin = mid
        else lngMax = mid
      } else {
        const mid = (latMin + latMax) / 2
        if (idx & mask) latMin = mid
        else latMax = mid
      }
      isLng = !isLng
    }
  }

  return {
    minLat: latMin,
    maxLat: latMax,
    minLng: lngMin,
    maxLng: lngMax,
    centerLat: (latMin + latMax) / 2,
    centerLng: (lngMin + lngMax) / 2,
  }
}

export function computePercentileFromBuckets(
  counts: readonly number[],
  upperBounds: readonly number[],
  percentile: number,
  openTailUpperMultiplier = 1.5,
): number | null {
  const total = counts.reduce((acc, c) => acc + c, 0)
  if (total === 0) return null

  const target = (Math.max(0, Math.min(100, percentile)) / 100) * total
  let cumulative = 0

  for (let i = 0; i < counts.length; i++) {
    const count = counts[i] ?? 0
    const prevCumulative = cumulative
    cumulative += count

    if (count > 0 && cumulative >= target) {
      const lower = i === 0 ? 0 : upperBounds[i - 1]
      const upper =
        i < upperBounds.length
          ? upperBounds[i]
          : upperBounds[upperBounds.length - 1] * openTailUpperMultiplier
      const ratio = Math.max(0, Math.min(1, (target - prevCumulative) / count))
      return Number((lower + (upper - lower) * ratio).toFixed(2))
    }
  }

  const lastBound = upperBounds[upperBounds.length - 1]
  return Number((lastBound * openTailUpperMultiplier).toFixed(2))
}

export type AnalyticsMetricKey =
  | 'volume'
  | 'resolution_rate'
  | 'first_response_median_h'
  | 'first_response_p90_h'
  | 'response_rate'
  | 'resolution_time_median_h'
  | 'resolution_time_p90_h'
  | 'backlog'
  | 'backlog_age_p50_h'
  | 'backlog_age_p90_h'
  | 'contest_rate'
  | 'reincidence'
  | 'recurrence_index'
  | 'trend'
  | 'pressure_p50_p90'
  | 'category_mix'
  | 'support_volume'
  | 'comment_volume'
  | 'outbreak_history'
  | 'sla_compliance_rate'

export interface MetricDictionaryEntry {
  key: AnalyticsMetricKey
  name: string
  definition: string
  formula: string
  version: string
}

export const ANALYTICS_METRIC_DICTIONARY: Record<AnalyticsMetricKey, MetricDictionaryEntry> = {
  volume: {
    key: 'volume',
    name: 'Volume de relatos',
    definition: 'Quantidade de relatos criados na área ou endereçados à organização no período.',
    formula: 'SUM(created_count) no intervalo [from, to] em America/Sao_Paulo',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  resolution_rate: {
    key: 'resolution_rate',
    name: 'Taxa de resolução',
    definition:
      'Proporção de relatos resolvidos frente ao conjunto maduro (resolvidos + abertos há mais de 7 dias), evitando penalizar relatos recém-criados.',
    formula: 'resolvidos ÷ (resolvidos + abertos_com_mais_de_7d)',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  first_response_median_h: {
    key: 'first_response_median_h',
    name: 'Tempo mediano de primeira resposta',
    definition:
      'Mediana (p50) em horas entre a criação do relato e o primeiro atendimento oficial registrado. Sempre acompanhada de response_rate.',
    formula: 'p50(firstResponseAt - createdAt) em horas via histograma de buckets',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  first_response_p90_h: {
    key: 'first_response_p90_h',
    name: 'Tempo de primeira resposta (p90)',
    definition: '90º percentil em horas entre criação e primeira resposta oficial entre relatos respondidos.',
    formula: 'p90(firstResponseAt - createdAt) em horas via histograma de buckets',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  response_rate: {
    key: 'response_rate',
    name: 'Taxa de resposta',
    definition: 'Percentual de relatos do período que receberam ao menos uma resposta oficial.',
    formula: 'respondidos ÷ volume',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  resolution_time_median_h: {
    key: 'resolution_time_median_h',
    name: 'Tempo mediano de resolução',
    definition: 'Mediana (p50) em horas entre a criação do relato e sua resolução (resolvedAt).',
    formula: 'p50(resolvedAt - createdAt) em horas via histograma de buckets',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  resolution_time_p90_h: {
    key: 'resolution_time_p90_h',
    name: 'Tempo de resolução (p90)',
    definition: '90º percentil em horas entre a criação e a resolução entre relatos resolvidos.',
    formula: 'p90(resolvedAt - createdAt) em horas via histograma de buckets',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  backlog: {
    key: 'backlog',
    name: 'Backlog em aberto',
    definition: 'Relatos criados no recorte que seguem não resolvidos (OPEN, UNDER_REVIEW, IN_PROGRESS, DISPUTED).',
    formula: 'SUM(open_current_count)',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  backlog_age_p50_h: {
    key: 'backlog_age_p50_h',
    name: 'Idade mediana do backlog',
    definition: 'Mediana da idade em horas dos relatos em aberto no momento do cálculo.',
    formula: 'p50((dia_atual - day) * 24h) ponderado por open_current_count',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  backlog_age_p90_h: {
    key: 'backlog_age_p90_h',
    name: 'Idade do backlog (p90)',
    definition: '90º percentil da idade em horas dos relatos em aberto.',
    formula: 'p90((dia_atual - day) * 24h) ponderado por open_current_count',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  contest_rate: {
    key: 'contest_rate',
    name: 'Taxa de contestação',
    definition: 'Proporção de relatos resolvidos que foram contestados pelo autor após marcação como resolvido.',
    formula: 'contestados ÷ (resolvidos + contestados)',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  reincidence: {
    key: 'reincidence',
    name: 'Células reincidentes',
    definition:
      'Células geohash-7 (~150 m) + categoria com 2 ou mais relatos nos últimos 90 dias (suprimidas abaixo de 10 na exibição, identificadas por rótulo legível do bairro dominante). No mapa de calor, quando a maioria das células de 150 m é suprimida, agrega-se adicionalmente em geohash-6 (~1,2 km) respeitando o mínimo de 10 relatos.',
    formula: 'COUNT(*) em recurrence_cells WHERE count_90d >= 2',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  recurrence_index: {
    key: 'recurrence_index',
    name: 'Índice de reincidência',
    definition: 'Participação de relatos localizados em células geohash-7 + categoria reincidentes sobre o total da janela.',
    formula: 'relatos_em_celulas_reincidentes ÷ total_relatos_90d',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  trend: {
    key: 'trend',
    name: 'Tendência (7d / 30d / 90d)',
    definition:
      'Variação percentual frente ao período imediatamente anterior de mesma duração. Quando todos os pontos da granularidade escolhida ficam abaixo de 10 relatos, a série agrega automaticamente para a próxima granularidade (dia -> semana -> mês).',
    formula: '((atual - anterior) ÷ anterior) * 100 (null se anterior = 0; aviso se base < 10)',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  pressure_p50_p90: {
    key: 'pressure_p50_p90',
    name: 'Pressão cidadã (p50 / p90)',
    definition: 'Distribuição da pontuação agregada de pressão dos relatos da área.',
    formula: 'p50 e p90 de pressureScore via histograma de buckets',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  category_mix: {
    key: 'category_mix',
    name: 'Distribuição por categoria',
    definition: 'Participação absoluta e percentual de cada categoria no período.',
    formula: 'volume_categoria ÷ volume_total',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  support_volume: {
    key: 'support_volume',
    name: 'Volume de apoios',
    definition: 'Total agregado de votos de apoio e confirmação (SUPPORT + ME_TOO).',
    formula: 'SUM(support_count)',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  comment_volume: {
    key: 'comment_volume',
    name: 'Volume de comentários',
    definition: 'Total agregado de comentários registrados nos relatos do período.',
    formula: 'SUM(comment_count)',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  outbreak_history: {
    key: 'outbreak_history',
    name: 'Histórico de surtos',
    definition: 'Registro histórico de surtos detectados na área territorial por categoria e janela.',
    formula: 'Surto WHERE state/cityKey no escopo territorial',
    version: ANALYTICS_DEFINITION_VERSION,
  },
  sla_compliance_rate: {
    key: 'sla_compliance_rate',
    name: 'Cumprimento dos prazos declarados pela entidade (SLA)',
    definition:
      'Proporção de relatos com prazo de 1ª resposta encerrado no período que foram respondidos dentro do SLA (MET ÷ (MET + MET_LATE + BREACHED)). No perfil público, o percentual só é exibido quando a entidade declarou ao menos uma categoria positiva em Entity.slaHours (hasOwnSla = true); sem política própria, o painel interno rotula como "prazo padrão" e o perfil público oculta o percentual.',
    formula: 'sla_met_count ÷ (sla_met_count + sla_breached_count)',
    version: ANALYTICS_DEFINITION_VERSION,
  },
}
