import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { VotesRepository } from './votes.repository'
import { PressureService } from '../press/pressure.service'
import { VoteType } from '@votz/shared-types'

@Injectable()
export class VotesService {
  constructor(
    private readonly repo: VotesRepository,
    private readonly prisma: PrismaService,
    private readonly pressure: PressureService,
  ) {}

  async toggle(reportId: string, userId: string, type: VoteType, emailVerified: boolean) {
    if (!emailVerified) throw new BadRequestException('Email verification required to vote')

    const report = await this.prisma.report.findUnique({ where: { id: reportId }, select: { id: true } })
    if (!report) throw new NotFoundException('Report not found')

    const existing = await this.repo.findExisting(reportId, userId, type)

    if (existing) {
      await this.repo.delete(reportId, userId, type)
    } else {
      await this.repo.create(reportId, userId, type)
    }

    // Enfileira recálculo imediato — fire-and-forget, não bloqueia a resposta
    this.pressure.enqueueReport(reportId).catch(() => null)

    return { voted: !existing, type }
  }

  async myVotes(reportId: string, userId: string) {
    const votes = await this.repo.findByUser(reportId, userId)
    return {
      SUPPORT: votes.some((v) => v.type === VoteType.SUPPORT),
      ME_TOO: votes.some((v) => v.type === VoteType.ME_TOO),
    }
  }

  async countsByReport(reportId: string) {
    const groups = await this.repo.countByReport(reportId)
    return groups.reduce(
      (acc, g) => ({ ...acc, [g.type]: g._count }),
      { SUPPORT: 0, ME_TOO: 0 } as Record<VoteType, number>,
    )
  }
}
