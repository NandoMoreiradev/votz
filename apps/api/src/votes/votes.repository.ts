import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { VoteType } from '@votz/shared-types'

@Injectable()
export class VotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findExisting(reportId: string, userId: string, type: VoteType) {
    return this.prisma.vote.findUnique({
      where: { reportId_userId_type: { reportId, userId, type } },
    })
  }

  create(reportId: string, userId: string, type: VoteType) {
    return this.prisma.vote.create({
      data: { reportId, userId, type },
    })
  }

  delete(reportId: string, userId: string, type: VoteType) {
    return this.prisma.vote.delete({
      where: { reportId_userId_type: { reportId, userId, type } },
    })
  }

  countByReport(reportId: string) {
    return this.prisma.vote.groupBy({
      by: ['type'],
      where: { reportId },
      _count: true,
    })
  }
}
