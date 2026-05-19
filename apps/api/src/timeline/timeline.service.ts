import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EventType } from '@votz/shared-types'

interface RecordEventParams {
  reportId: string
  type: EventType
  content: string
  authorId?: string | null
  metadata?: object
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: params.metadata ? (params.metadata as any) : undefined,
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
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
  }
}
