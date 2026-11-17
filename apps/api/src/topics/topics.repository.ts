import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class TopicsRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertTopic(slug: string, displayTag: string) {
    return this.prisma.civicTopic.upsert({
      where: { slug },
      update: { lastActivityAt: new Date() },
      create: { slug, displayTag, lastActivityAt: new Date() },
    })
  }

  async replacePostTopics(postId: string, topicIds: string[]) {
    const existing = await this.prisma.postTopic.findMany({
      where: { postId },
      select: { topicId: true },
    })
    const affectedIds = Array.from(new Set([...existing.map((e) => e.topicId), ...topicIds]))

    await this.prisma.$transaction([
      this.prisma.postTopic.deleteMany({ where: { postId } }),
      ...(topicIds.length > 0
        ? [
            this.prisma.postTopic.createMany({
              data: topicIds.map((topicId) => ({ postId, topicId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ])

    return affectedIds
  }

  async replaceReportTopics(reportId: string, topicIds: string[]) {
    const existing = await this.prisma.reportTopic.findMany({
      where: { reportId },
      select: { topicId: true },
    })
    const affectedIds = Array.from(new Set([...existing.map((e) => e.topicId), ...topicIds]))

    await this.prisma.$transaction([
      this.prisma.reportTopic.deleteMany({ where: { reportId } }),
      ...(topicIds.length > 0
        ? [
            this.prisma.reportTopic.createMany({
              data: topicIds.map((topicId) => ({ reportId, topicId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ])

    return affectedIds
  }

  async replaceDebateTopics(debateId: string, topicIds: string[]) {
    const existing = await this.prisma.debateTopic.findMany({
      where: { debateId },
      select: { topicId: true },
    })
    const affectedIds = Array.from(new Set([...existing.map((e) => e.topicId), ...topicIds]))

    await this.prisma.$transaction([
      this.prisma.debateTopic.deleteMany({ where: { debateId } }),
      ...(topicIds.length > 0
        ? [
            this.prisma.debateTopic.createMany({
              data: topicIds.map((topicId) => ({ debateId, topicId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ])

    return affectedIds
  }

  async refreshTopicCounts(topicIds: string[]) {
    for (const topicId of topicIds) {
      const [postsCount, reportsCount, debatesCount] = await Promise.all([
        this.prisma.postTopic.count({ where: { topicId } }),
        this.prisma.reportTopic.count({ where: { topicId } }),
        this.prisma.debateTopic.count({ where: { topicId } }),
      ])

      const tractionScore = Math.round((postsCount * 1.5 + reportsCount * 3.0 + debatesCount * 4.0) * 10) / 10

      await this.prisma.civicTopic.update({
        where: { id: topicId },
        data: {
          postsCount,
          reportsCount,
          debatesCount,
          tractionScore,
          lastActivityAt: new Date(),
        },
      })
    }
  }

  findTrending(limit = 10, state?: string, cityKey?: string) {
    const geoPostFilter =
      state || cityKey
        ? {
            posts: {
              some: {
                post: {
                  ...(state ? { state } : {}),
                  ...(cityKey ? { cityKey } : {}),
                },
              },
            },
          }
        : undefined

    const geoReportFilter =
      state || cityKey
        ? {
            reports: {
              some: {
                report: {
                  ...(state ? { state } : {}),
                  ...(cityKey ? { cityKey } : {}),
                },
              },
            },
          }
        : undefined

    return this.prisma.civicTopic.findMany({
      where: {
        OR: [{ postsCount: { gt: 0 } }, { reportsCount: { gt: 0 } }, { debatesCount: { gt: 0 } }],
        ...(geoPostFilter && geoReportFilter ? { AND: [{ OR: [geoPostFilter, geoReportFilter] }] } : {}),
      },
      orderBy: [{ tractionScore: 'desc' }, { lastActivityAt: 'desc' }],
      take: limit,
    })
  }

  searchByPrefix(q: string, limit = 8) {
    const clean = q
      .replace(/^#/, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

    return this.prisma.civicTopic.findMany({
      where: clean ? { slug: { contains: clean } } : undefined,
      orderBy: [{ tractionScore: 'desc' }, { lastActivityAt: 'desc' }],
      take: limit,
    })
  }

  findBySlug(slug: string) {
    return this.prisma.civicTopic.findUnique({ where: { slug } })
  }

  async findTopicDetailData(topicId: string, userId?: string) {
    const [reports, debates, cities, follower] = await Promise.all([
      this.prisma.reportTopic.findMany({
        where: { topicId },
        take: 20,
        orderBy: { report: { pressureScore: 'desc' } },
        select: {
          report: {
            select: {
              id: true,
              title: true,
              description: true,
              category: true,
              status: true,
              city: true,
              state: true,
              pressureScore: true,
              media: true,
              createdAt: true,
              _count: { select: { votes: true, comments: true } },
            },
          },
        },
      }),
      this.prisma.debateTopic.findMany({
        where: { topicId },
        take: 10,
        orderBy: { debate: { scheduledFor: 'desc' } },
        select: {
          debate: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              scheduledFor: true,
              viewerCount: true,
              creator: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
      }),
      this.prisma.postTopic.findMany({
        where: { topicId },
        select: { post: { select: { city: true, state: true } } },
        take: 200,
      }),
      userId
        ? this.prisma.userTopicFollower.findUnique({
            where: { userId_topicId: { userId, topicId } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ])

    const cityCountMap = new Map<string, number>()
    for (const row of cities) {
      const label = [row.post.city, row.post.state].filter(Boolean).join(' · ')
      if (label) cityCountMap.set(label, (cityCountMap.get(label) ?? 0) + 1)
    }
    for (const row of reports) {
      const label = [row.report.city, row.report.state].filter(Boolean).join(' · ')
      if (label) cityCountMap.set(label, (cityCountMap.get(label) ?? 0) + 1)
    }

    const topCities = Array.from(cityCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }))

    return {
      reports: reports.map((r) => r.report),
      debates: debates.map((d) => d.debate),
      topCities,
      following: !!follower,
    }
  }

  async toggleFollow(userId: string, topicId: string) {
    const existing = await this.prisma.userTopicFollower.findUnique({
      where: { userId_topicId: { userId, topicId } },
    })
    if (existing) {
      await this.prisma.userTopicFollower.delete({ where: { id: existing.id } })
      return { following: false }
    }
    await this.prisma.userTopicFollower.create({ data: { userId, topicId } })
    return { following: true }
  }
}
