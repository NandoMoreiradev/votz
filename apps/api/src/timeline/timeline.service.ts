import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EventType } from '@votz/shared-types'

interface RecordEventParams {
  reportId: string
  type: EventType
  content: string
  authorId?: string | null
  metadata?: Record<string, unknown>
}

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordEventParams) {
    return this.prisma.timelineEvent.create({
      data: {
        reportId: params.reportId,
        type: params.type,
        content: params.content,
        authorId: params.authorId ?? null,
        metadata: params.metadata ?? undefined,
      },
    })
  }

  async findByReport(reportId: string) {
    return this.prisma.timelineEvent.findMany({
      where: { reportId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        content: true,
        metadata: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    })
  }
}
