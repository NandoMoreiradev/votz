import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Category, PRESS_SEARCH_LIMITS as L, normalizeLocationKey, type PressSearchResponse } from '@votz/shared-types'
import { EmbeddingService } from '../embedding/embedding.service'
import { PressAccessService } from './press-access.service'
import { PressSearchRepository } from './press-search.repository'
import { TtlCache } from './ttl-cache'

/** Similaridade mínima (0 a 1). Com o modelo atual, texto sem relação fica perto de 0,60 e o parecido passa de 0,75. */
export const DEFAULT_SEARCH_MIN_SCORE = 0.7
const QUERY_EMBEDDING_CACHE_MS = 10 * 60_000
const MISSING_COUNT_CACHE_MS = 2 * 60_000
const EXCERPT_CHARS = 240

export interface SearchInput {
  q: string
  days?: number
  state?: string
  city?: string
  category?: string
}

export function makeExcerpt(text: string, max = EXCERPT_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

@Injectable()
export class PressSearchService {
  private readonly logger = new Logger(PressSearchService.name)
  private readonly cache = new TtlCache(300)

  constructor(
    private readonly access: PressAccessService,
    private readonly embedding: EmbeddingService,
    private readonly repo: PressSearchRepository,
    private readonly config: ConfigService,
  ) {}

  async search(userId: string, input: SearchInput): Promise<PressSearchResponse> {
    const access = await this.access.require(userId)

    const query = input.q?.replace(/\s+/g, ' ').trim() ?? ''
    if (query.length < L.QUERY_MIN) throw new BadRequestException(`Escreva pelo menos ${L.QUERY_MIN} letras para buscar.`)
    if (query.length > L.QUERY_MAX) throw new BadRequestException(`A busca aceita até ${L.QUERY_MAX} caracteres.`)
    if (input.state && !/^[A-Za-z]{2}$/.test(input.state)) {
      throw new BadRequestException('Estado inválido. Use a sigla com 2 letras, por exemplo SP.')
    }
    if (input.category && !(Object.values(Category) as string[]).includes(input.category)) {
      throw new BadRequestException('Categoria inválida.')
    }
    const maxDays = access.limits.exportMaxDays
    const days = Math.min(Math.max(Math.trunc(input.days ?? maxDays), 7), maxDays)

    let vector: number[]
    try {
      // A mesma pergunta repetida (ou de outra pessoa) não gasta outra chamada ao Google.
      vector = await this.cache.get(`q:${query.toLowerCase()}`, QUERY_EMBEDDING_CACHE_MS, () => this.embedding.embed(query, 'query'))
    } catch (err) {
      this.logger.error(`Falha ao gerar o embedding da busca: ${(err as Error).message}`)
      throw new ServiceUnavailableException('A busca por significado está fora do ar agora. Tente de novo em instantes.')
    }

    const city = input.city?.trim().slice(0, 100)
    const [rows, missing] = await Promise.all([
      this.repo.searchByEmbedding(vector, {
        since: new Date(Date.now() - days * 86_400_000),
        minScore: this.minScore(),
        limit: access.limits.searchResults,
        state: input.state?.toUpperCase(),
        cityKey: city ? normalizeLocationKey(city) : undefined,
        cityLower: city?.toLowerCase(),
        category: input.category,
      }),
      this.cache.get('missing', MISSING_COUNT_CACHE_MS, () => this.repo.countMissingEmbeddings()),
    ])

    return {
      query,
      total: rows.length,
      results: rows.map((r) => ({
        id: r.id,
        title: r.title,
        excerpt: makeExcerpt(r.description),
        category: r.category,
        status: r.status,
        city: r.city,
        state: r.state,
        pressureScore: Math.round(r.pressureScore * 100) / 100,
        createdAt: new Date(r.createdAt).toISOString(),
        pressContactOk: r.pressContactOk === true,
        score: Math.round(Number(r.score) * 100),
      })),
      indexing: { missing },
    }
  }

  private minScore(): number {
    const raw = Number(this.config.get('PRESS_SEARCH_MIN_SCORE'))
    return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : DEFAULT_SEARCH_MIN_SCORE
  }
}
