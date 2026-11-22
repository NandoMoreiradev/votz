import { Injectable } from '@nestjs/common'
import { ContentAdjacencyRepository } from './content-adjacency.repository'

export interface NearbyContent {
  /** Publicações em volta do espaço de anúncio. */
  postIds?: readonly string[]
  /** Relatos em volta do espaço de anúncio (para feeds de relatos, se um dia tiverem anúncio). */
  reportIds?: readonly string[]
}

/**
 * Regra do Votz: nenhum anúncio perto de relato contra o próprio anunciante. Dado o conteúdo em volta de um espaço de
 * anúncio, diz de quais empresas os relatos ali tratam (a empresa em si ou uma filial dela). Quem pede (a entrega de
 * anúncios) tira essas empresas da disputa. Conteúdo que não fala de empresa não restringe nada.
 */
@Injectable()
export class ContentAdjacencyService {
  constructor(private readonly repo: ContentAdjacencyRepository) {}

  async companiesTargetedNear(near: NearbyContent): Promise<string[]> {
    const mentioned = await this.repo.reportIdsMentionedBy([...new Set(near.postIds ?? [])])
    const reportIds = [...new Set([...(near.reportIds ?? []), ...mentioned])]
    if (!reportIds.length) return []

    const recipients = await this.repo.reportRecipients(reportIds)
    const companies = new Set<string>()
    const branches = new Set<string>()
    for (const { recipientType, recipientId } of recipients) {
      if (!recipientId) continue
      if (recipientType === 'COMPANY') companies.add(recipientId)
      else if (recipientType === 'BRANCH') branches.add(recipientId)
    }
    if (branches.size) for (const branch of await this.repo.branchCompanies([...branches])) companies.add(branch.companyId)
    return [...companies]
  }
}
