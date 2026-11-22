import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Consultas mínimas para dizer "este conteúdo fala de quais empresas". Só devolve ids: nunca texto, autor, voto ou
 * qualquer dado de pessoa. Fica fora da pasta de anúncios de propósito (o teste do muro proíbe o código de anúncios de
 * ler relatos): o que sai daqui só serve para TIRAR anúncio de perto de conteúdo, nunca para escolher ou perfilar.
 */
@Injectable()
export class ContentAdjacencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Relatos citados nas publicações (e nas publicações que elas citam). Só os ids dos relatos. */
  async reportIdsMentionedBy(postIds: string[]): Promise<string[]> {
    if (!postIds.length) return []
    const posts = await this.prisma.post.findMany({
      where: { id: { in: postIds } },
      select: { mentionedReportId: true, quotePost: { select: { mentionedReportId: true } } },
    })
    return posts.flatMap((post) => [post.mentionedReportId, post.quotePost?.mentionedReportId]).filter((id): id is string => !!id)
  }

  /** Para quem cada relato foi endereçado, quando o destinatário é empresa ou filial. */
  reportRecipients(reportIds: string[]) {
    if (!reportIds.length) return Promise.resolve([])
    return this.prisma.report.findMany({
      where: { id: { in: reportIds }, recipientType: { in: ['COMPANY', 'BRANCH'] }, recipientId: { not: null } },
      select: { recipientType: true, recipientId: true },
    })
  }

  /** Empresa dona de cada filial. */
  branchCompanies(branchIds: string[]) {
    if (!branchIds.length) return Promise.resolve([])
    return this.prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { companyId: true } })
  }
}
