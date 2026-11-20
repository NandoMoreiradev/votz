import { Injectable } from '@nestjs/common'
import { OrgType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const CHANNEL_SELECT = {
  id: true,
  orgType: true,
  orgId: true,
  channelId: true,
  title: true,
  verificationCode: true,
  verifiedAt: true,
  createdAt: true,
} as const

@Injectable()
export class YoutubeChannelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByChannelId(channelId: string) {
    return this.prisma.youtubeChannel.findUnique({ where: { channelId }, select: CHANNEL_SELECT })
  }

  findOwned(id: string, orgType: OrgType, orgId: string) {
    return this.prisma.youtubeChannel.findFirst({ where: { id, orgType, orgId }, select: CHANNEL_SELECT })
  }

  listByOrg(orgType: OrgType, orgId: string) {
    return this.prisma.youtubeChannel.findMany({
      where: { orgType, orgId },
      orderBy: { createdAt: 'asc' },
      select: CHANNEL_SELECT,
    })
  }

  create(data: {
    orgType: OrgType
    orgId: string
    channelId: string
    title: string
    verificationCode: string
    createdByUserId: string
  }) {
    return this.prisma.youtubeChannel.create({ data, select: CHANNEL_SELECT })
  }

  markVerified(id: string, title: string) {
    return this.prisma.youtubeChannel.update({
      where: { id },
      data: { verifiedAt: new Date(), title },
      select: CHANNEL_SELECT,
    })
  }

  delete(id: string) {
    return this.prisma.youtubeChannel.delete({ where: { id } })
  }

  /** Apaga uma reivindicação que nunca foi verificada (só verificada dá direito sobre o canal). */
  deleteUnverified(id: string) {
    return this.prisma.youtubeChannel.deleteMany({ where: { id, verifiedAt: null } })
  }

  async isVerifiedFor(orgType: OrgType, orgId: string, channelId: string): Promise<boolean> {
    const count = await this.prisma.youtubeChannel.count({
      where: { orgType, orgId, channelId, verifiedAt: { not: null } },
    })
    return count > 0
  }
}
