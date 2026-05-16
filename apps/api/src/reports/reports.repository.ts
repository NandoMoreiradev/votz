import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateReportDto } from './dto/create-report.dto'
import { Category, ReportStatus } from '@votz/shared-types'

const PUBLIC_REPORT_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  status: true,
  anonymous: true,
  latitude: true,
  longitude: true,
  normalizedAddress: true,
  city: true,
  state: true,
  neighborhood: true,
  media: true,
  pressureScore: true,
  recipientType: true,
  recipientId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { votes: true, comments: true } },
  author: { select: { id: true, name: true, avatarUrl: true } },
} as const

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReportDto, authorId: string | null) {
    return this.prisma.report.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        category: dto.category,
        anonymous: dto.anonymous ?? false,
        latitude: dto.latitude,
        longitude: dto.longitude,
        recipientType: dto.recipientType,
        recipientId: dto.recipientId,
        authorId: dto.anonymous ? null : authorId,
        media: dto.media ?? [],
      },
      select: PUBLIC_REPORT_SELECT,
    })
  }

  async findById(id: string) {
    return this.prisma.report.findUnique({
      where: { id },
      select: {
        ...PUBLIC_REPORT_SELECT,
        timeline: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            type: true,
            content: true,
            metadata: true,
            createdAt: true,
            author: { select: { id: true, name: true } },
          },
        },
      },
    })
  }

  async findAll(filters: {
    category?: Category
    status?: ReportStatus
    city?: string
    state?: string
    page: number
    limit: number
  }) {
    const where = {
      ...(filters.category && { category: filters.category }),
      ...(filters.status && { status: filters.status }),
      ...(filters.city && { city: { contains: filters.city, mode: 'insensitive' as const } }),
      ...(filters.state && { state: filters.state }),
    }

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        select: PUBLIC_REPORT_SELECT,
        orderBy: [{ pressureScore: 'desc' }, { createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.report.count({ where }),
    ])

    return { reports, total }
  }

  async updateStatus(id: string, status: ReportStatus) {
    return this.prisma.report.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    })
  }
}
