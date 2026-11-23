import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  getCategoryLabel,
  type PressBriefing,
  type PressBriefingContent,
  type PressBriefingReference,
  type PressBriefingStats,
} from '@votz/shared-types'
import { PressAccessService } from './press-access.service'
import { PressBriefingAnalyzer } from './press-briefing.analyzer'
import { PressBriefingRepository } from './press-briefing.repository'
import {
  BRIEFING_DISCLAIMER,
  MAX_REPORTS_IN_PROMPT,
  allowedDigitTokens,
  buildBriefingPrompt,
  computeStats,
  isBriefingFresh,
  parseBriefing,
  toPromptReport,
} from './press-briefing.rules'

/** Quantas vezes pede o texto à IA antes de desistir e mostrar só os números. */
const MAX_ATTEMPTS = 2

@Injectable()
export class PressBriefingService {
  private readonly logger = new Logger(PressBriefingService.name)
  /** Quem pede o mesmo surto ao mesmo tempo espera a mesma geração (uma chamada à IA, não várias). */
  private readonly inflight = new Map<string, Promise<PressBriefing>>()

  constructor(
    private readonly access: PressAccessService,
    private readonly repo: PressBriefingRepository,
    private readonly analyzer: PressBriefingAnalyzer,
  ) {}

  async get(userId: string, surtoId: string): Promise<PressBriefing> {
    const { limits } = await this.access.require(userId)
    if (!limits.aiBriefing) throw new ForbiddenException('O briefing de surto é do plano Imprensa Pro.')

    const surto = await this.repo.findSurto(surtoId)
    if (!surto) throw new NotFoundException('Surto não encontrado.')

    const latest = await this.repo.latestBriefing(surtoId)
    if (latest && isBriefingFresh(latest)) return this.toDto(latest)

    const running = this.inflight.get(surtoId)
    if (running) return running
    const promise = this.generate(surto).finally(() => this.inflight.delete(surtoId))
    this.inflight.set(surtoId, promise)
    return promise
  }

  private async generate(surto: { id: string; category: string; city: string; state: string }): Promise<PressBriefing> {
    const [rows, total] = await Promise.all([this.repo.loadReports(surto.id), this.repo.countReports(surto.id)])
    if (rows.length === 0) throw new NotFoundException('Este surto não tem relatos ligados.')

    const entityIds = [...new Set(rows.filter((r) => r.recipientType === 'ENTITY' && r.recipientId).map((r) => r.recipientId!))]
    const stats = computeStats(surto, rows, total, await this.repo.entityNames(entityIds))

    // Só relatos públicos (não anônimos) vão para a IA e para a lista de fontes.
    const publicRows = rows.filter((r) => !r.anonymous).slice(0, MAX_REPORTS_IN_PROMPT)
    const promptReports = publicRows.map((r, i) => toPromptReport(i + 1, r))
    const references: PressBriefingReference[] = publicRows.map((r, i) => ({
      n: i + 1, id: r.id, title: r.title, city: r.city, state: r.state,
    }))

    // Números que fazem parte de nomes (cidade, bairros) podem aparecer no texto; qualquer outro número é recusado.
    const allowedDigits = allowedDigitTokens([surto.city, ...promptReports.map((r) => r.neighborhood)])

    let content: PressBriefingContent | null = null
    if (this.analyzer.available && promptReports.length > 0) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !content; attempt++) {
        try {
          const prompt = buildBriefingPrompt(
            { category: surto.category, city: surto.city, state: surto.state, categoryLabel: getCategoryLabel(surto.category) },
            promptReports,
            attempt > 0,
          )
          content = parseBriefing(await this.analyzer.generate(prompt), promptReports.length, allowedDigits)
          if (!content) this.logger.warn(`Briefing do surto ${surto.id}: resposta da IA recusada na checagem (tentativa ${attempt + 1})`)
        } catch (err) {
          this.logger.error(`Briefing do surto ${surto.id}: a IA falhou (tentativa ${attempt + 1}): ${(err as Error).message}`)
        }
      }
    }

    const saved = await this.repo.saveBriefing({
      surtoId: surto.id,
      aiGenerated: content !== null,
      model: content ? this.analyzer.model : null,
      content: content as unknown as Prisma.InputJsonValue | null,
      stats: stats as unknown as Prisma.InputJsonValue,
      references: references as unknown as Prisma.InputJsonValue,
    })
    return this.toDto(saved)
  }

  private toDto(row: {
    surtoId: string
    generatedAt: Date
    aiGenerated: boolean
    content: Prisma.JsonValue | null
    stats: Prisma.JsonValue
    references: Prisma.JsonValue
  }): PressBriefing {
    return {
      surtoId: row.surtoId,
      generatedAt: row.generatedAt.toISOString(),
      aiGenerated: row.aiGenerated,
      stats: row.stats as unknown as PressBriefingStats,
      content: row.aiGenerated ? (row.content as unknown as PressBriefingContent) : null,
      references: (row.references ?? []) as unknown as PressBriefingReference[],
      disclaimer: BRIEFING_DISCLAIMER,
    }
  }
}
