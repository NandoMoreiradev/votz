import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { VoteType, type UserGender } from '@votz/shared-types'

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  username: true,
  type: true,
  verified: true,
  reputation: true,
  avatarUrl: true,
  coverUrl: true,
  bio: true,
  createdAt: true,
} as const

const ME_USER_SELECT = {
  ...PUBLIC_USER_SELECT,
  email: true,
  emailVerified: true,
  mfaEnabled: true,
  password: true,
  termsAcceptedAt: true,
  termsVersion: true,
  privacyVersion: true,
  ageConfirmedAt: true,
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
  // Só para a própria pessoa (perfil e configurações); nunca no perfil público.
  birthDate: true,
  gender: true,
  _count: {
    select: { reports: true, votes: true, comments: true },
  },
} as const

function toMeUser<T extends { password?: string | null }>(user: T | null) {
  if (!user) return null
  const { password, ...rest } = user
  return { ...rest, hasPassword: Boolean(password) }
}

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
      select: { id: true, email: true, name: true, type: true, password: true, avatarUrl: true, coverUrl: true },
    })
  }

  async findByIdWithStats(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...PUBLIC_USER_SELECT,
        _count: {
          select: { reports: true, votes: true, comments: true, followerUsers: true },
        },
      },
    })
    if (!user) return null
    const { followerUsers, ...counts } = user._count
    return { ...user, _count: counts, followersCount: followerUsers }
  }

  async findMe(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: ME_USER_SELECT,
    })
    return toMeUser(user)
  }

  async acceptConsent(
    id: string,
    data: {
      termsAcceptedAt: Date
      ageConfirmedAt: Date
      termsVersion: string
      privacyVersion: string
    },
  ) {
    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: ME_USER_SELECT,
    })
    return toMeUser(user)
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
    username?: string
    bio?: string
    avatarUrl?: string
    coverUrl?: string
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
    birthDate?: Date | null
    gender?: UserGender | null
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
        birthDate: true,
        gender: true,
      },
    })
  }
}
