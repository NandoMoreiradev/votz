import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import DOMPurify from 'isomorphic-dompurify'
import { OrgPermission } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PropostasRepository } from './propostas.repository'
import { CreatePropostaDto } from './dto/create-proposta.dto'
import { UpdatePropostaStatusDto } from './dto/update-status-proposta.dto'
import { ListPropostasQueryDto } from './dto/list-propostas-query.dto'
import { Category, PropostaEventType, PropostaStatus, hasFeature } from '@votz/shared-types'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { planRequiredException } from '../auth/plan-errors'

@Injectable()
export class PropostasService {
  constructor(
    private readonly repository: PropostasRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(dto: CreatePropostaDto, user: ActingUser) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      'POLITICIAN',
      OrgPermission.MANAGE_PROFILE,
    )

    const politician = await this.repository.findPoliticianById(acting.orgId)
    if (!politician) throw new ForbiddenException('Perfil de político ativo não encontrado')

    if (!hasFeature('POLITICIAN', politician.plan, 'propostas')) {
      throw planRequiredException('POLITICIAN', 'propostas')
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
    user: ActingUser,
  ) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      'POLITICIAN',
      OrgPermission.MANAGE_PROFILE,
    )

    const proposta = await this.repository.findById(id)
    if (!proposta) throw new NotFoundException('Proposta não encontrada')

    if (proposta.politicoId !== acting.orgId) {
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
