import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface SearchFilters {
  since: Date
  minScore: number
  limit: number
  state?: string
  cityKey?: string
  cityLower?: string
  category?: string
}

export interface SearchRow {
  id: string
  title: string
  description: string
  category: string
  status: string
  city: string | null
  state: string | null
  pressureScore: number
  createdAt: Date
  pressContactOk: boolean
  score: number
}

/**
 * Consultas da busca por significado (pgvector). A coluna `embedding` não existe no Prisma Client, então
 * isto usa SQL. Nada do que a pessoa digita entra no texto do SQL: o texto vira vetor de números e
 * todos os filtros vão como parâmetros do Prisma (`$1`, `$2`…), inclusive o vetor (convertido com `::vector`).
 */
@Injectable()
export class PressSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async searchByEmbedding(embedding: number[], f: SearchFilters): Promise<SearchRow[]> {
    if (embedding.length === 0 || !embedding.every(Number.isFinite)) throw new Error('Embedding inválido')
    const vector = `[${embedding.map((n) => n.toFixed(8)).join(',')}]`

    const conditions: Prisma.Sql[] = [
      Prisma.sql`embedding IS NOT NULL`,
      Prisma.sql`anonymous = false`,
      Prisma.sql`status <> 'ARCHIVED'`,
      Prisma.sql`"createdAt" >= ${f.since}`,
      Prisma.sql`1 - (embedding <=> ${vector}::vector) >= ${f.minScore}`,
    ]
    if (f.state) conditions.push(Prisma.sql`state = ${f.state}`)
    if (f.cityKey) conditions.push(Prisma.sql`(city_key = ${f.cityKey} OR lower(city) = ${f.cityLower ?? f.cityKey})`)
    if (f.category) conditions.push(Prisma.sql`category = ${f.category}::"Category"`)

    return this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT
        id, title, description, category::text AS category, status::text AS status, city, state,
        "pressureScore", "createdAt", press_contact_ok AS "pressContactOk",
        1 - (embedding <=> ${vector}::vector) AS score
      FROM reports
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${f.limit}
    `)
  }

  /** Relatos públicos que ainda não entraram no índice (são indexados aos poucos pelo job de preenchimento). */
  async countMissingEmbeddings(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT count(*)::int AS n FROM reports
      WHERE embedding IS NULL AND anonymous = false AND status <> 'ARCHIVED'
    `)
    return rows[0]?.n ?? 0
  }
}
