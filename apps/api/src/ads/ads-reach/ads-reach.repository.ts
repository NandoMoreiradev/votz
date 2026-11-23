import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { buildAudienceWhere } from './reach-rules'

type AudienceWhere = ReturnType<typeof buildAudienceWhere>

/**
 * Só conta pessoas em `users` (cidade, estado, nascimento, gênero) e a preferência de anúncios. Devolve contagem,
 * nunca linhas de pessoas (muro de privacidade).
 */
@Injectable()
export class AdsReachRepository {
  constructor(private readonly prisma: PrismaService) {}

  count(where: AudienceWhere): Promise<number> {
    return this.prisma.user.count({ where })
  }

  /** Pessoas por cidade (nome como cadastrado), para comparar sem acento na memória. */
  async countByCity(where: AudienceWhere): Promise<{ city: string | null; count: number }[]> {
    const rows = await this.prisma.user.groupBy({ by: ['city'], where, _count: { _all: true } })
    return rows.map((row) => ({ city: row.city, count: row._count._all }))
  }
}
