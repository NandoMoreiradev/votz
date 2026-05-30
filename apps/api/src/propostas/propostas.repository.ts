import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreatePropostaDto } from './dto/create-proposta.dto'
import { Category, PropostaStatus } from '@votz/shared-types'

const POLITICO_SELECT = {
  id: true,
  name: true,
  office: true,
  avatarUrl: true,
  party: { select: { abbreviation: true, name: true } },
} as const

const PUBLIC_PROPOSTA_SELECT = {
  id: true,
  titulo: true,
  descricao: true,
  status: true,
  categorias: true,
  politicoId: true,
  linkExterno: true,
  createdAt: true,
  updatedAt: true,
  politico: { select: POLITICO_SELECT },
} as const

const TIMELINE_SELECT = {
  id: true,
  tipo: true,
  conteudo: true,
  metadata: true,
  createdAt: true,
  autor: { select: { id: true, name: true, avatarUrl: true } },
} as const

@Injectable()
export class PropostasRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async mergeVoteCounts<T extends { id: string }>(
    items: T[],
  ): Promise<(T & { totalApoios: number; totalRejeicoes: number })[]> {
    if (items.length === 0) return items.map(i => ({ ...i, totalApoios: 0, totalRejeicoes: 0 }))

    const groups = await this.prisma.propostaVoto.groupBy({
      by: ['propostaId', 'apoio'],
      where: { propostaId: { in: items.map(p => p.id) } },
      _count: { _all: true },
    })

    const apoiosMap = new Map<string, number>()
    const rejeicoesMap = new Map<string, number>()
    for (const g of groups) {
      if (g.apoio) apoiosMap.set(g.propostaId, g._count._all)
      else rejeicoesMap.set(g.propostaId, g._count._all)
    }

    return items.map(p => ({
      ...p,
      totalApoios: apoiosMap.get(p.id) ?? 0,
      totalRejeicoes: rejeicoesMap.get(p.id) ?? 0,
    }))
  }

  async create(dto: CreatePropostaDto, politicoId: string) {
    const proposta = await this.prisma.proposta.create({
      data: {
        titulo: dto.titulo.trim(),
        descricao: dto.descricao.trim(),
        categorias: dto.categorias,
        linkExterno: dto.linkExterno ?? null,
        politicoId,
      },
      select: PUBLIC_PROPOSTA_SELECT,
    })
    const [enriched] = await this.mergeVoteCounts([proposta])
    return enriched
  }

  async findAll(filters: {
    politicoId?: string
    status?: PropostaStatus
    categoria?: Category
    page: number
    limit: number
  }) {
    const where = {
      ...(filters.politicoId && { politicoId: filters.politicoId }),
      ...(filters.status
        ? { status: filters.status }
        : { status: { not: PropostaStatus.DRAFT } }),
      ...(filters.categoria && { categorias: { has: filters.categoria } }),
    }

    const [raw, total] = await Promise.all([
      this.prisma.proposta.findMany({
        where,
        select: PUBLIC_PROPOSTA_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.proposta.count({ where }),
    ])

    const propostas = await this.mergeVoteCounts(raw)
    return { propostas, total }
  }

  async findById(id: string) {
    const proposta = await this.prisma.proposta.findUnique({
      where: { id },
      select: {
        ...PUBLIC_PROPOSTA_SELECT,
        timeline: {
          orderBy: { createdAt: 'asc' },
          select: TIMELINE_SELECT,
        },
      },
    })
    if (!proposta) return null
    const [enriched] = await this.mergeVoteCounts([proposta])
    return enriched
  }

  async updateStatus(id: string, status: PropostaStatus) {
    return this.prisma.proposta.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    })
  }

  async addTimeline(data: {
    propostaId: string
    tipo: string
    conteudo: string
    autorId: string | null
    metadata?: Record<string, unknown>
  }) {
    return this.prisma.propostaTimeline.create({
      data: {
        propostaId: data.propostaId,
        tipo: data.tipo as never,
        conteudo: data.conteudo,
        autorId: data.autorId,
        metadata: data.metadata ?? {},
      },
      select: TIMELINE_SELECT,
    })
  }

  async findPoliticianByUserId(userId: string) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { userId, orgType: 'POLITICIAN', status: 'ACTIVE' },
      select: { orgId: true },
    })
    return membership ? { id: membership.orgId } : null
  }

  async upsertVoto(propostaId: string, usuarioId: string, apoio: boolean) {
    return this.prisma.propostaVoto.upsert({
      where: { propostaId_usuarioId: { propostaId, usuarioId } },
      create: { propostaId, usuarioId, apoio },
      update: { apoio },
    })
  }

  async removeVoto(propostaId: string, usuarioId: string) {
    await this.prisma.propostaVoto.deleteMany({ where: { propostaId, usuarioId } })
  }

  async findMeuVoto(propostaId: string, usuarioId: string) {
    return this.prisma.propostaVoto.findUnique({
      where: { propostaId_usuarioId: { propostaId, usuarioId } },
      select: { apoio: true },
    })
  }
}
