import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ReportStatus, VoteType } from '@votz/shared-types'

export const PRESSURE_QUEUE = 'pressure'

const ACTIVE_STATUSES: ReportStatus[] = [
  ReportStatus.OPEN,
  ReportStatus.UNDER_REVIEW,
  ReportStatus.IN_PROGRESS,
]

// Seção 8.3 — pesos calibrados por tipo de sinal
const W = {
  SUPPORT: 1.5,         // apoio genérico
  ME_TOO: 2.5,          // impacto direto, peso maior
  COMMENT: 1.0,         // engajamento
  DAY_NO_RESPONSE: 2.0, // urgência crescente sem resposta
  SIMILAR: 3.0,         // problema sistêmico (grupo explícito)
} as const

// Máximo de relatos similares computados por grupo (evita distorção em cidades grandes)
const MAX_SIMILAR = 20

// Chunk para o UPDATE FROM VALUES (2 params por linha → limite PG é 65535)
const BATCH_CHUNK = 5_000

export interface PressureJob {
  reportId?: string
}

function computeScore(params: {
  supportVotes: number
  meTooVotes: number
  comments: number
  daysSinceCreation: number
  hasResponse: boolean
  similarCount: number
}): number {
  const diasSemResposta = params.hasResponse ? 0 : params.daysSinceCreation
  const capped = Math.min(params.similarCount, MAX_SIMILAR)

  const raw =
    params.supportVotes * W.SUPPORT +
    params.meTooVotes * W.ME_TOO +
    params.comments * W.COMMENT +
    diasSemResposta * W.DAY_NO_RESPONSE +
    capped * W.SIMILAR

  return Math.round(raw * 10) / 10
}

@Injectable()
export class PressureService {
  private readonly logger = new Logger(PressureService.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PRESSURE_QUEUE) private readonly queue: Queue,
  ) {}

  // ── Enqueue helpers ────────────────────────────────────────────────────────

  async enqueueReport(reportId: string): Promise<void> {
    // jobId garante deduplicação: se já existe job pendente para o relato, não duplica
    await this.queue.add(
      'recalculate-single',
      { reportId },
      {
        jobId: `single:${reportId}`,
        removeOnComplete: 200,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    )
  }

  async enqueueBatch(): Promise<void> {
    await this.queue.add(
      'recalculate-batch',
      {},
      {
        jobId: 'batch',
        removeOnComplete: 10,
        removeOnFail: 10,
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
      },
    )
  }

  // ── Core recalculation ─────────────────────────────────────────────────────

  async recalculateOne(reportId: string): Promise<void> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        status: true,
        category: true,
        createdAt: true,
        groupId: true,
        _count: { select: { comments: true } },
        timeline: {
          where: { type: 'RESPONDED' },
          select: { id: true },
          take: 1,
        },
      },
    })

    if (!report) return
    if (!ACTIVE_STATUSES.includes(report.status as ReportStatus)) return

    const [voteGroups, similarCount] = await Promise.all([
      this.prisma.vote.groupBy({
        by: ['type'],
        where: { reportId },
        _count: { _all: true },
      }),
      report.groupId
        ? this.prisma.report.count({
            where: {
              groupId: report.groupId,
              id: { not: reportId },
              status: { in: ACTIVE_STATUSES },
            },
          })
        : Promise.resolve(0),
    ])

    const voteMap = Object.fromEntries(voteGroups.map(g => [g.type, g._count._all])) as Record<
      string,
      number
    >

    const score = computeScore({
      supportVotes: voteMap[VoteType.SUPPORT] ?? 0,
      meTooVotes: voteMap[VoteType.ME_TOO] ?? 0,
      comments: report._count.comments,
      daysSinceCreation: Math.floor((Date.now() - report.createdAt.getTime()) / 86_400_000),
      hasResponse: report.timeline.length > 0,
      similarCount,
    })

    await this.prisma.report.update({
      where: { id: reportId },
      data: { pressureScore: score },
    })

    this.logger.debug(`[single] ${reportId} → ${score}`)
  }

  async recalculateBatch(): Promise<{ updated: number }> {
    this.logger.log('Batch pressure recalculation started')

    const reports = await this.prisma.report.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: {
        id: true,
        category: true,
        createdAt: true,
        groupId: true,
        _count: { select: { comments: true } },
        timeline: {
          where: { type: 'RESPONDED' },
          select: { id: true },
          take: 1,
        },
      },
    })

    if (reports.length === 0) {
      this.logger.log('No active reports — skipping batch')
      return { updated: 0 }
    }

    const ids = reports.map(r => r.id)

    // Busca contagem de votos de todos os relatos ativos em uma única query groupBy
    const allVotes = await this.prisma.vote.groupBy({
      by: ['reportId', 'type'],
      where: { reportId: { in: ids } },
      _count: { _all: true },
    })

    // Map: reportId → { SUPPORT, ME_TOO }
    const voteMap = new Map<string, { SUPPORT: number; ME_TOO: number }>()
    for (const v of allVotes) {
      const entry = voteMap.get(v.reportId) ?? { SUPPORT: 0, ME_TOO: 0 }
      if (v.type === VoteType.SUPPORT) entry.SUPPORT = v._count._all
      if (v.type === VoteType.ME_TOO) entry.ME_TOO = v._count._all
      voteMap.set(v.reportId, entry)
    }

    // Map: groupId → contagem de relatos ativos no grupo
    const groupMap = new Map<string, number>()
    for (const r of reports) {
      if (r.groupId) groupMap.set(r.groupId, (groupMap.get(r.groupId) ?? 0) + 1)
    }

    const now = Date.now()

    const scores = reports.map(r => {
      const votes = voteMap.get(r.id) ?? { SUPPORT: 0, ME_TOO: 0 }
      const similarCount = r.groupId ? Math.max((groupMap.get(r.groupId) ?? 1) - 1, 0) : 0

      return {
        id: r.id,
        score: computeScore({
          supportVotes: votes.SUPPORT,
          meTooVotes: votes.ME_TOO,
          comments: r._count.comments,
          daysSinceCreation: Math.floor((now - r.createdAt.getTime()) / 86_400_000),
          hasResponse: r.timeline.length > 0,
          similarCount,
        }),
      }
    })

    await this.batchUpdateScores(scores)
    this.logger.log(`Batch complete: ${scores.length} reports updated`)
    return { updated: scores.length }
  }

  // ── Batch SQL update ───────────────────────────────────────────────────────

  private async batchUpdateScores(scores: { id: string; score: number }[]): Promise<void> {
    for (let i = 0; i < scores.length; i += BATCH_CHUNK) {
      const chunk = scores.slice(i, i + BATCH_CHUNK)

      // UPDATE FROM VALUES — um único round-trip por chunk, independente do tamanho
      const values = Prisma.join(
        chunk.map(s => Prisma.sql`(${s.id}::uuid, ${s.score}::float8)`),
      )

      await this.prisma.$executeRaw`
        UPDATE reports r
        SET   pressure_score = v.score,
              updated_at     = NOW()
        FROM  (VALUES ${values}) AS v(id, score)
        WHERE r.id = v.id
      `
    }
  }
}
