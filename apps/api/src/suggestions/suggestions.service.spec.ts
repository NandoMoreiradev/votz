jest.mock('isomorphic-dompurify', () => ({
  sanitize: (s: string) => s.replace(/<[^>]*>/g, ''),
}))

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { SuggestionCategory, SuggestionStatus, UserType } from '@prisma/client'
import { SuggestionsService } from './suggestions.service'

describe('SuggestionsService', () => {
  const repo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    toggleVote: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
  }

  let service: SuggestionsService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new SuggestionsService(repo as any)
  })

  it('sanitizes and creates a suggestion', async () => {
    repo.create.mockResolvedValue({
      id: 'sug-1',
      title: 'Mapa por bairro',
      description: 'Seria ótimo filtrar relatos por bairro.',
      category: SuggestionCategory.FEATURE,
      status: SuggestionStatus.OPEN,
      votesCount: 0,
    })

    const res = await service.create('user-1', {
      title: '  <b>Mapa</b> por bairro  ',
      description: 'Seria ótimo filtrar relatos por bairro.',
      category: SuggestionCategory.FEATURE,
    })

    expect(repo.create).toHaveBeenCalledWith({
      authorId: 'user-1',
      title: 'Mapa por bairro',
      description: 'Seria ótimo filtrar relatos por bairro.',
      category: SuggestionCategory.FEATURE,
    })
    expect(res.hasVoted).toBe(false)
  })

  it('rejects short title after sanitization', async () => {
    await expect(
      service.create('user-1', {
        title: '<b>oi</b>',
        description: 'Descrição longa o suficiente para passar.',
        category: SuggestionCategory.BUG,
      }),
    ).rejects.toThrow(BadRequestException)
  })

  it('throws NotFoundException when toggling vote on missing suggestion', async () => {
    repo.findById.mockResolvedValue(null)
    await expect(service.toggleVote('missing', 'user-1')).rejects.toThrow(NotFoundException)
  })

  it('updates status and sanitizes adminNote', async () => {
    repo.findById.mockResolvedValue({ id: 'sug-1', adminNote: null })
    repo.updateStatus.mockResolvedValue({ id: 'sug-1', status: SuggestionStatus.PLANNED })

    await service.updateStatus('sug-1', 'admin-1', {
      status: SuggestionStatus.PLANNED,
      adminNote: '<b>Entrou no roadmap Q2</b>',
    })

    expect(repo.updateStatus).toHaveBeenCalledWith('sug-1', {
      status: SuggestionStatus.PLANNED,
      adminNote: 'Entrou no roadmap Q2',
      reviewedById: 'admin-1',
    })
  })

  it('forbids deleting another user suggestion for non-staff', async () => {
    repo.findById.mockResolvedValue({ id: 'sug-1', authorId: 'user-2', status: SuggestionStatus.OPEN })
    await expect(service.remove('sug-1', { id: 'user-1', type: UserType.CITIZEN })).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('allows staff to delete any suggestion', async () => {
    repo.findById.mockResolvedValue({ id: 'sug-1', authorId: 'user-2', status: SuggestionStatus.PLANNED })
    repo.delete.mockResolvedValue({ id: 'sug-1' })

    const res = await service.remove('sug-1', { id: 'admin-1', type: UserType.ADMIN })
    expect(res).toEqual({ deleted: true })
  })
})
