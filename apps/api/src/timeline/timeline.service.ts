import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TipoEvento } from '@votz/shared-types'

interface RegistrarEventoParams {
  relatoId: string
  tipo: TipoEvento
  descricao: string
  autorId?: string | null
  metadados?: Record<string, unknown>
}

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(params: RegistrarEventoParams) {
    return this.prisma.timelineEvento.create({
      data: {
        relatoId: params.relatoId,
        tipo: params.tipo,
        descricao: params.descricao,
        autorId: params.autorId ?? null,
        metadados: params.metadados ?? undefined,
      },
    })
  }

  async buscarPorRelato(relatoId: string) {
    return this.prisma.timelineEvento.findMany({
      where: { relatoId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        tipo: true,
        descricao: true,
        metadados: true,
        createdAt: true,
        autor: { select: { id: true, nome: true } },
      },
    })
  }
}
