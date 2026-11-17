import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { SuggestionStatus, UserType } from '@prisma/client'
import * as DOMPurify from 'isomorphic-dompurify'
import { CreateSuggestionDto } from './dto/create-suggestion.dto'
import { ListSuggestionsQueryDto } from './dto/list-suggestions-query.dto'
import { UpdateSuggestionStatusDto } from './dto/update-suggestion-status.dto'
import { SuggestionsRepository } from './suggestions.repository'

@Injectable()
export class SuggestionsService {
  constructor(private readonly repo: SuggestionsRepository) {}

  list(query: ListSuggestionsQueryDto, viewerId?: string) {
    return this.repo.findMany({
      status: query.status,
      category: query.category,
      sort: query.sort ?? 'top',
      page: query.page ?? 1,
      limit: Math.min(query.limit ?? 20, 50),
      viewerId,
    })
  }

  async create(userId: string, dto: CreateSuggestionDto) {
    const title = DOMPurify.sanitize(dto.title).trim()
    const description = DOMPurify.sanitize(dto.description).trim()

    if (title.length < 5) {
      throw new BadRequestException('O título deve ter pelo menos 5 caracteres.')
    }
    if (description.length < 15) {
      throw new BadRequestException('Descreva a sugestão com pelo menos 15 caracteres.')
    }

    const created = await this.repo.create({
      authorId: userId,
      title,
      description,
      category: dto.category,
    })

    return { ...created, hasVoted: false }
  }

  async toggleVote(id: string, userId: string) {
    const existing = await this.repo.findById(id)
    if (!existing) {
      throw new NotFoundException('Sugestão não encontrada.')
    }
    return this.repo.toggleVote(id, userId)
  }

  async updateStatus(id: string, actorId: string, dto: UpdateSuggestionStatusDto) {
    const existing = await this.repo.findById(id)
    if (!existing) {
      throw new NotFoundException('Sugestão não encontrada.')
    }

    const adminNote = dto.adminNote !== undefined
      ? (DOMPurify.sanitize(dto.adminNote).trim() || null)
      : existing.adminNote

    return this.repo.updateStatus(id, {
      status: dto.status,
      adminNote,
      reviewedById: actorId,
    })
  }

  async remove(id: string, actor: { id: string; type: string }) {
    const existing = await this.repo.findById(id)
    if (!existing) {
      throw new NotFoundException('Sugestão não encontrada.')
    }

    const isStaff = actor.type === UserType.ADMIN || actor.type === UserType.MODERATOR
    if (!isStaff) {
      if (existing.authorId !== actor.id) {
        throw new ForbiddenException('Você não pode excluir a sugestão de outro usuário.')
      }
      if (existing.status !== SuggestionStatus.OPEN) {
        throw new BadRequestException('Sugestões já analisadas pela equipe não podem ser excluídas.')
      }
    }

    await this.repo.delete(id)
    return { deleted: true }
  }
}
