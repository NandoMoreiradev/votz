import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  type: true,
  verified: true,
  reputation: true,
  avatarUrl: true,
  bio: true,
  createdAt: true,
} as const

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_SELECT,
    })
  }

  findByIdWithStats(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        ...PUBLIC_USER_SELECT,
        _count: {
          select: { reports: true, votes: true, comments: true },
        },
      },
    })
  }

  updateProfile(id: string, data: { name?: string; bio?: string; avatarUrl?: string }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: PUBLIC_USER_SELECT,
    })
  }
}
