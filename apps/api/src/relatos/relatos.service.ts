import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import DOMPurify from 'isomorphic-dompurify'
import { RelatosRepository } from './relatos.repository'
import { TimelineService } from '../timeline/timeline.service'
import { CriarRelatoDto } from './dto/criar-relato.dto'
import { AtualizarStatusDto } from './dto/atualizar-status.dto'
import { Categoria, StatusRelato, TipoEvento, TipoUsuario } from '@votz/shared-types'

@Injectable()
export class RelatosService {
  constructor(
    private readonly repository: RelatosRepository,
    private readonly timeline: TimelineService,
  ) {}

  async criar(dto: CriarRelatoDto, usuario: { id: string; tipo: string }) {
    const descricaoSanitizada = DOMPurify.sanitize(dto.descricao)
    const tituloLimpo = dto.titulo.trim().replace(/\s+/g, ' ')

    const relato = await this.repository.criar(
      { ...dto, titulo: tituloLimpo, descricao: descricaoSanitizada },
      dto.anonimo ? null : usuario.id,
    )

    await this.timeline.registrar({
      relatoId: relato.id,
      tipo: TipoEvento.CRIADO,
      descricao: 'Relato registrado na plataforma Votz.',
      autorId: dto.anonimo ? null : usuario.id,
    })

    return relato
  }

  async buscarPorId(id: string) {
    const relato = await this.repository.buscarPorId(id)
    if (!relato) throw new NotFoundException('Relato não encontrado')
    return relato
  }

  async listar(filtros: {
    categoria?: Categoria
    status?: StatusRelato
    cidade?: string
    estado?: string
    page: number
    limit: number
  }) {
    const { relatos, total } = await this.repository.listar(filtros)
    return {
      data: relatos,
      meta: {
        page: filtros.page,
        limit: filtros.limit,
        total,
        totalPages: Math.ceil(total / filtros.limit),
      },
    }
  }

  async atualizarStatus(
    relatoId: string,
    dto: AtualizarStatusDto,
    usuario: { id: string; tipo: string },
  ) {
    const relato = await this.repository.buscarPorId(relatoId)
    if (!relato) throw new NotFoundException('Relato não encontrado')

    // Apenas entidades, moderadores e admins podem atualizar status
    const tiposAutorizados = [TipoUsuario.ENTIDADE, TipoUsuario.MODERADOR, TipoUsuario.ADMIN]
    if (!tiposAutorizados.includes(usuario.tipo as TipoUsuario)) {
      throw new ForbiddenException('Sem permissão para atualizar status')
    }

    const relatoAtualizado = await this.repository.atualizarStatus(relatoId, dto.status)

    await this.timeline.registrar({
      relatoId,
      tipo: TipoEvento.STATUS_ALTERADO,
      descricao: dto.descricao,
      autorId: usuario.id,
      metadados: { statusAnterior: relato.status, statusNovo: dto.status },
    })

    return relatoAtualizado
  }
}
