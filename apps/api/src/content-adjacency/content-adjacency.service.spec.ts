import { ContentAdjacencyService } from './content-adjacency.service'

function makeRepo(parts: { mentioned?: string[]; recipients?: { recipientType: 'COMPANY' | 'BRANCH'; recipientId: string | null }[]; branches?: { companyId: string }[] } = {}) {
  return {
    reportIdsMentionedBy: jest.fn().mockResolvedValue(parts.mentioned ?? []),
    reportRecipients: jest.fn().mockResolvedValue(parts.recipients ?? []),
    branchCompanies: jest.fn().mockResolvedValue(parts.branches ?? []),
  }
}

describe('ContentAdjacencyService', () => {
  it('sem nada em volta, não consulta o banco e não restringe nada', async () => {
    const repo = makeRepo()
    expect(await new ContentAdjacencyService(repo as never).companiesTargetedNear({})).toEqual([])
    expect(repo.reportRecipients).not.toHaveBeenCalled()
  })

  it('relato citado numa publicação em volta, endereçado a uma empresa: a empresa sai', async () => {
    const repo = makeRepo({ mentioned: ['r1'], recipients: [{ recipientType: 'COMPANY', recipientId: 'co-1' }] })
    expect(await new ContentAdjacencyService(repo as never).companiesTargetedNear({ postIds: ['p1', 'p1', 'p2'] })).toEqual(['co-1'])
    expect(repo.reportIdsMentionedBy).toHaveBeenCalledWith(['p1', 'p2'])
    expect(repo.reportRecipients).toHaveBeenCalledWith(['r1'])
  })

  it('relato endereçado a uma filial vale para a empresa dona dela', async () => {
    const repo = makeRepo({ recipients: [{ recipientType: 'BRANCH', recipientId: 'fil-1' }], branches: [{ companyId: 'co-7' }] })
    expect(await new ContentAdjacencyService(repo as never).companiesTargetedNear({ reportIds: ['r9'] })).toEqual(['co-7'])
    expect(repo.branchCompanies).toHaveBeenCalledWith(['fil-1'])
  })

  it('junta os relatos do pedido com os citados nas publicações e não repete empresa', async () => {
    const repo = makeRepo({
      mentioned: ['r1', 'r2'],
      recipients: [
        { recipientType: 'COMPANY', recipientId: 'co-1' },
        { recipientType: 'COMPANY', recipientId: 'co-1' },
        { recipientType: 'BRANCH', recipientId: 'fil-1' },
        { recipientType: 'COMPANY', recipientId: null },
      ],
      branches: [{ companyId: 'co-1' }],
    })
    const result = await new ContentAdjacencyService(repo as never).companiesTargetedNear({ postIds: ['p1'], reportIds: ['r2', 'r3'] })
    expect(result).toEqual(['co-1'])
    expect(repo.reportRecipients).toHaveBeenCalledWith(['r2', 'r3', 'r1'])
  })

  it('relato de entidade pública ou político (o repositório só devolve empresa e filial) não restringe', async () => {
    const repo = makeRepo({ mentioned: ['r1'], recipients: [] })
    expect(await new ContentAdjacencyService(repo as never).companiesTargetedNear({ postIds: ['p1'] })).toEqual([])
    expect(repo.branchCompanies).not.toHaveBeenCalled()
  })

  it('erro do banco sobe para quem pediu decidir (a entrega não mostra anúncio)', async () => {
    const repo = makeRepo()
    repo.reportIdsMentionedBy.mockRejectedValue(new Error('banco fora'))
    await expect(new ContentAdjacencyService(repo as never).companiesTargetedNear({ postIds: ['p1'] })).rejects.toThrow('banco fora')
  })
})
