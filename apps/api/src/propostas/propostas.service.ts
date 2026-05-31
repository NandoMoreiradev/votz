import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import DOMPurify from 'isomorphic-dompurify'
import { PropostasRepository } from './propostas.repository'
import { CreatePropostaDto } from './dto/create-proposta.dto'
import { UpdatePropostaStatusDto } from './dto/update-status-proposta.dto'
import { ListPropostasQueryDto } from './dto/list-propostas-query.dto'
import { Category, PropostaEventType, PropostaStatus, UserType } from '@votz/shared-types'

@Injectable()
export class PropostasService {
  constructor(private readonly repository: PropostasRepository) {}

  async create(dto: CreatePropostaDto, user: { id: string; type: string }) {
    if (user.type !== UserType.POLITICIAN) {
      throw new ForbiddenException('Apenas políticos podem criar propostas')
    }

    const politician = await this.repository.findPoliticianByUserId(user.id)
    if (!politician) throw new ForbiddenException('Perfil de político ativo não encontrado')

    const PROPOSTA_PLANS = ['MANDATOMETRO_PRO', 'CAMPANHA']
    if (!PROPOSTA_PLANS.includes(politician.plan)) {
      throw new ForbiddenException('Criar propostas requer o plano Mandatômetro Pro ou superior')
    }

    const sanitizedTitulo = DOMPurify.sanitize(dto.titulo).trim()
    const sanitizedDescricao = DOMPurify.sanitize(dto.descricao)

    const proposta = await this.repository.create(
      { ...dto, titulo: sanitizedTitulo, descricao: sanitizedDescricao },
      politician.id,
    )

    await this.repository.addTimeline({
      propostaId: proposta.id,
      tipo: PropostaEventType.CREATED,
      conteudo: 'Proposta registrada na plataforma Votz.',
      autorId: user.id,
    })

    return proposta
  }

  async findAll(query: ListPropostasQueryDto) {
    const { propostas, total } = await this.repository.findAll({
      politicoId: query.politicoId,
      status: query.status,
      categoria: query.categoria as Category | undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    })

    return {
      data: propostas,
      meta: {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        total,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    }
  }

  async findById(id: string) {
    const proposta = await this.repository.findById(id)
    if (!proposta) throw new NotFoundException('Proposta não encontrada')
    return proposta
  }

  async updateStatus(
    id: string,
    dto: UpdatePropostaStatusDto,
    user: { id: string; type: string },
  ) {
    if (user.type !== UserType.POLITICIAN) {
      throw new ForbiddenException('Apenas políticos podem atualizar o status de propostas')
    }

    const politician = await this.repository.findPoliticianByUserId(user.id)
    if (!politician) throw new ForbiddenException('Perfil de político ativo não encontrado')

    const proposta = await this.repository.findById(id)
    if (!proposta) throw new NotFoundException('Proposta não encontrada')

    if (proposta.politicoId !== politician.id) {
      throw new ForbiddenException('Você não é o autor desta proposta')
    }

    if (proposta.status === PropostaStatus.ARCHIVED) {
      throw new BadRequestException('Propostas arquivadas não podem ter o status alterado')
    }

    const sanitizedConteudo = DOMPurify.sanitize(dto.conteudo)

    await this.repository.updateStatus(id, dto.status)
    await this.repository.addTimeline({
      propostaId: id,
      tipo: PropostaEventType.STATUS_CHANGED,
      conteudo: sanitizedConteudo,
      autorId: user.id,
      metadata: { previousStatus: proposta.status, newStatus: dto.status },
    })

    return this.repository.findById(id)
  }

  async votar(id: string, apoio: boolean, userId: string) {
    const proposta = await this.repository.findById(id)
    if (!proposta) throw new NotFoundException('Proposta não encontrada')

    if (proposta.status === PropostaStatus.DRAFT || proposta.status === PropostaStatus.ARCHIVED) {
      throw new BadRequestException('Não é possível votar em propostas em rascunho ou arquivadas')
    }

    await this.repository.upsertVoto(id, userId, apoio)
    return { votado: true, apoio }
  }

  async removerVoto(id: string, userId: string) {
    const proposta = await this.repository.findById(id)
    if (!proposta) throw new NotFoundException('Proposta não encontrada')

    await this.repository.removeVoto(id, userId)
    return { votado: false }
  }

  async meuVoto(id: string, userId: string) {
    const voto = await this.repository.findMeuVoto(id, userId)
    return { apoio: voto?.apoio ?? null }
  }
}
