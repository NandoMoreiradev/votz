import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const COMMENT_SELECT = {
  id: true,
  content: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { replies: true } },
} as const

@Injectable()
export class CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { reportId: string; authorId: string; content: string; parentId?: string }) {
    return this.prisma.comment.create({
      data,
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
