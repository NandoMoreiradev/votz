import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const COMMENT_SELECT = {
  id: true,
  content: true,
  parentId: true,
  mediaType: true,
  mediaUrl: true,
  mediaDuration: true,
  transcript: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { replies: true } },
} as const

@Injectable()
export class CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    reportId: string
    authorId: string
    content: string
    parentId?: string
    mediaType?: string
    mediaUrl?: string
    mediaKey?: string
    mediaDuration?: number
  }) {
    return this.prisma.comment.create({
      data: {
        reportId: data.reportId,
        authorId: data.authorId,
        content: data.content,
        parentId: data.parentId,
        mediaType: (data.mediaType ?? 'TEXT') as never,
        mediaUrl: data.mediaUrl,
        mediaKey: data.mediaKey,
        mediaDuration: data.mediaDuration,
      },
      select: COMMENT_SELECT,
    })
  }

  findByReport(reportId: string) {
    return this.prisma.comment.findMany({
      where: { reportId, parentId: null },
      orderBy: { createdAt: 'asc' },
      select: {
        ...COMMENT_SELECT,
        replies: {
          orderBy: { createdAt: 'asc' },
          select: COMMENT_SELECT,
        },
      },
    })
  }

  findById(id: string) {
    return this.prisma.comment.findUnique({ where: { id }, select: { id: true, authorId: true } })
  }

  update(id: string, content: string) {
    return this.prisma.comment.update({
      where: { id },
      data: { content },
      select: COMMENT_SELECT,
    })
  }

  delete(id: string) {
    return this.prisma.comment.delete({ where: { id } })
  }
}
