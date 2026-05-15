import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CriarRelatoDto } from './dto/criar-relato.dto'
import { Categoria, StatusRelato } from '@votz/shared-types'

const SELECAO_PUBLICA_RELATO = {
  id: true,
  titulo: true,
  descricao: true,
  categoria: true,
  status: true,
  anonimo: true,
  latitude: true,
  longitude: true,
  enderecoNormalizado: true,
  cidade: true,
  estado: true,
  bairro: true,
  midias: true,
  scorePressao: true,
  destinatarioTipo: true,
  destinatarioId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { votos: true, comentarios: true } },
  autor: {
    select: { id: true, nome: true, avatarUrl: true },
  },
} as const

@Injectable()
export class RelatosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dto: CriarRelatoDto, autorId: string | null) {
    return this.prisma.relato.create({
      data: {
        titulo: dto.titulo.trim(),
        descricao: dto.descricao.trim(),
        categoria: dto.categoria,
        anonimo: dto.anonimo ?? false,
        latitude: dto.latitude,
        longitude: dto.longitude,
        destinatarioTipo: dto.destinatarioTipo,
        destinatarioId: dto.destinatarioId,
        autorId: dto.anonimo ? null : autorId,
      },
      select: SELECAO_PUBLICA_RELATO,
    })
  }

  async buscarPorId(id: string) {
    return this.prisma.relato.findUnique({
      where: { id },
      select: {
        ...SELECAO_PUBLICA_RELATO,
        timeline: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            tipo: true,
            descricao: true,
            metadados: true,
            createdAt: true,
            autor: { select: { id: true, nome: true } },
          },
        },
      },
    })
  }

  async listar(filtros: {
    categoria?: Categoria
    status?: StatusRelato
    cidade?: string
    estado?: string
    page: number
    limit: number
  }) {
    const where = {
      ...(filtros.categoria && { categoria: filtros.categoria }),
      ...(filtros.status && { status: filtros.status }),
      ...(filtros.cidade && { cidade: { contains: filtros.cidade, mode: 'insensitive' as const } }),
      ...(filtros.estado && { estado: filtros.estado }),
    }

    const [relatos, total] = await Promise.all([
      this.prisma.relato.findMany({
        where,
        select: SELECAO_PUBLICA_RELATO,
        orderBy: [{ scorePressao: 'desc' }, { createdAt: 'desc' }],
        skip: (filtros.page - 1) * filtros.limit,
        take: filtros.limit,
      }),
      this.prisma.relato.count({ where }),
    ])

    return { relatos, total }
  }

  async atualizarStatus(id: string, status: string) {
    return this.prisma.relato.update({
      where: { id },
      data: { status: status as StatusRelato },
      select: { id: true, status: true },
    })
  }
}
