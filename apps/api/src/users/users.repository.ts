import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { VoteType } from '@votz/shared-types'

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

const REPORT_LIST_SELECT = {
  id: true,
  title: true,
  category: true,
  status: true,
  city: true,
  state: true,
  pressureScore: true,
  createdAt: true,
  _count: { select: { votes: { where: { type: VoteType.SUPPORT } }, comments: true } },
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

  findWithPassword(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, type: true, password: true, avatarUrl: true },
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

  findMe(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        ...PUBLIC_USER_SELECT,
        email: true,
        emailVerified: true,
        mfaEnabled: true,
        phone: true,
        zipCode: true,
        street: true,
        streetNumber: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        country: true,
        latitude: true,
        longitude: true,
        _count: {
          select: { reports: true, votes: true, comments: true },
        },
      },
    })
  }

  async findUserReports(authorId: string, page: number, limit: number) {
    const where = { authorId, anonymous: false }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        select: REPORT_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ])
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  updateProfile(id: string, data: {
    name?: string
    bio?: string
    avatarUrl?: string
    phone?: string
    zipCode?: string
    streetNumber?: string
    complement?: string
    street?: string
    neighborhood?: string
    city?: string
    state?: string
    latitude?: number
    longitude?: number
  }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        ...PUBLIC_USER_SELECT,
        email: true,
        emailVerified: true,
        phone: true,
        zipCode: true,
        street: true,
        streetNumber: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        country: true,
        latitude: true,
        longitude: true,
      },
    })
  }
}
