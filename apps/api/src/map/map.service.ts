import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MapQueryDto } from './dto/map-query.dto'
import { Prisma } from '@prisma/client'

@Injectable()
export class MapService {
  constructor(private readonly prisma: PrismaService) {}

  async getMapReports(query: MapQueryDto) {
    const where: Prisma.ReportWhereInput = {
      latitude: { not: null },
      longitude: { not: null },
      ...(query.category && { category: query.category }),
      ...(query.status && { status: query.status }),
      ...(query.swLat !== undefined && query.neLat !== undefined && {
        latitude: { gte: query.swLat, lte: query.neLat },
      }),
      ...(query.swLng !== undefined && query.neLng !== undefined && {
        longitude: { gte: query.swLng, lte: query.neLng },
      }),
    }

    const reports = await this.prisma.report.findMany({
      where,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        pressureScore: true,
        latitude: true,
        longitude: true,
        city: true,
        _count: { select: { votes: true, comments: true } },
      },
      orderBy: { pressureScore: 'desc' },
      take: query.limit ?? 500,
    })

    // GeoJSON FeatureCollection — formato padrão para Mapbox
    return {
      type: 'FeatureCollection' as const,
      features: reports.map((r) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [r.longitude!, r.latitude!],
        },
        properties: {
          id: r.id,
          title: r.title,
          category: r.category,
          status: r.status,
          pressureScore: r.pressureScore,
          city: r.city,
          votes: r._count.votes,
          comments: r._count.comments,
        },
      })),
    }
  }
}
