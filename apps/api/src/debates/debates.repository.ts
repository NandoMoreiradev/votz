import { Injectable } from '@nestjs/common'
import { DebateStatus, InviteStatus, ParticipantRole, ReactionType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const PARTICIPANT_SELECT = {
  id: true,
  politicianId: true,
  role: true,
  inviteStatus: true,
  createdAt: true,
  politician: {
    select: { id: true, name: true, avatarUrl: true, office: true, party: { select: { abbreviation: true } } },
  },
} as const

const DEBATE_SELECT = {
  id: true,
  title: true,
  description: true,
  scheduledFor: true,
  status: true,
  livekitRoomName: true,
  hlsUrl: true,
  recordingUrl: true,
  egressId: true,
  viewerCount: true,
  chatCooldownSecs: true,
  creatorId: true,
  createdAt: true,
  updatedAt: true,
  creator: {
    select: { id: true, name: true, avatarUrl: true, office: true, party: { select: { abbreviation: true } } },
  },
  participants: { select: PARTICIPANT_SELECT },
} as const

const QUESTION_SELECT = {
  id: true,
  debateId: true,
  text: true,
  upvotes: true,
  answered: true,
  createdAt: true,
  author: { select: { id: true, name: true, avatarUrl: true } },
} as const

const MESSAGE_SELECT = {
  id: true,
  debateId: true,
  text: true,
  createdAt: true,
  author: { select: { id: true, name: true, avatarUrl: true } },
} as const

const POLL_SELECT = {
  id: true,
  debateId: true,
  question: true,
  active: true,
  createdAt: true,
  options: { select: { id: true, text: true, totalVotes: true } },
} as const

@Injectable()
export class DebatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    title: string
    description?: string
    scheduledFor: Date
    creatorId: string
  }) {
    return this.prisma.debate.create({ data, select: DEBATE_SELECT })
  }

  findById(id: string) {
    return this.prisma.debate.findUnique({ where: { id }, select: DEBATE_SELECT })
  }

  findAll(params: {
    status?: DebateStatus
    politicianId?: string
    upcoming?: boolean
    page: number
    limit: number
  }) {
    const { status, politicianId, upcoming, page, limit } = params
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (upcoming) where.scheduledFor = { gt: new Date() }
    if (politicianId) {
      where.OR = [
        { creatorId: politicianId },
        { participants: { some: { politicianId } } },
      ]
    }
    const skip = (page - 1) * limit
    return this.prisma.$transaction([
      this.prisma.debate.findMany({ where, skip, take: limit, orderBy: { scheduledFor: 'asc' }, select: DEBATE_SELECT }),
      this.prisma.debate.count({ where }),
    ])
  }

  updateStatus(id: string, status: DebateStatus, extra?: Record<string, unknown>) {
    return this.prisma.debate.update({ where: { id }, data: { status, ...extra } })
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.debate.update({ where: { id }, data, select: DEBATE_SELECT })
  }

  createParticipant(debateId: string, politicianId: string, role: ParticipantRole, inviteStatus: InviteStatus) {
    return this.prisma.debateParticipant.create({ data: { debateId, politicianId, role, inviteStatus } })
  }

  findParticipant(debateId: string, politicianId: string) {
    return this.prisma.debateParticipant.findUnique({ where: { debateId_politicianId: { debateId, politicianId } } })
  }

  updateParticipantInvite(debateId: string, politicianId: string, inviteStatus: InviteStatus) {
    return this.prisma.debateParticipant.update({
      where: { debateId_politicianId: { debateId, politicianId } },
      data: { inviteStatus },
    })
  }

  countPendingInvites(debateId: string) {
    return this.prisma.debateParticipant.count({ where: { debateId, inviteStatus: InviteStatus.PENDING } })
  }

  async isParticipant(debateId: string, politicianId: string): Promise<boolean> {
    const record = await this.findParticipant(debateId, politicianId)
    return !!record && record.inviteStatus === InviteStatus.CONFIRMED
  }

  createQuestion(debateId: string, authorId: string, text: string) {
    return this.prisma.debateQuestion.create({
      data: { debateId, authorId, text },
      select: QUESTION_SELECT,
    })
  }

  upvoteQuestion(questionId: string) {
    return this.prisma.debateQuestion.update({
      where: { id: questionId },
      data: { upvotes: { increment: 1 } },
      select: QUESTION_SELECT,
    })
  }

  findQuestions(debateId: string) {
    return this.prisma.debateQuestion.findMany({
      where: { debateId },
      orderBy: { upvotes: 'desc' },
      select: QUESTION_SELECT,
    })
  }

  createMessage(debateId: string, authorId: string, text: string) {
    return this.prisma.debateMessage.create({
      data: { debateId, authorId, text },
      select: MESSAGE_SELECT,
    })
  }

  findMessages(debateId: string, limit = 50) {
    return this.prisma.debateMessage.findMany({
      where: { debateId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: MESSAGE_SELECT,
    }).then((msgs) => msgs.reverse())
  }

  createReaction(debateId: string, type: ReactionType) {
    return this.prisma.debateReaction.create({ data: { debateId, type } })
  }

  createPoll(debateId: string, question: string, options: string[]) {
    return this.prisma.debatePoll.create({
      data: {
        debateId,
        question,
        options: { create: options.map((text) => ({ text })) },
      },
      select: POLL_SELECT,
    })
  }

  findActivePoll(debateId: string) {
    return this.prisma.debatePoll.findFirst({
      where: { debateId, active: true },
      select: POLL_SELECT,
      orderBy: { createdAt: 'desc' },
    })
  }

  async votePoll(pollId: string, optionId: string, userId: string) {
    await this.prisma.$transaction([
      this.prisma.debatePollVote.create({ data: { pollId, optionId, userId } }),
      this.prisma.debatePollOption.update({
        where: { id: optionId },
        data: { totalVotes: { increment: 1 } },
      }),
    ])
    return this.prisma.debatePoll.findUnique({ where: { id: pollId }, select: POLL_SELECT })
  }

  getFollowersOfPoliticians(politicianIds: string[]) {
    return this.prisma.userPoliticianFollower.findMany({
      where: { politicianId: { in: politicianIds } },
      select: { userId: true },
    })
  }

  findPoliticianByUserId(userId: string) {
    return this.prisma.orgMembership.findFirst({
      where: { userId, orgType: 'POLITICIAN', status: 'ACTIVE' },
      select: { orgId: true },
    })
  }

  followPolitician(userId: string, politicianId: string) {
    return this.prisma.userPoliticianFollower.upsert({
      where: { userId_politicianId: { userId, politicianId } },
      create: { userId, politicianId },
      update: {},
    })
  }

  unfollowPolitician(userId: string, politicianId: string) {
    return this.prisma.userPoliticianFollower.deleteMany({ where: { userId, politicianId } })
  }

  isFollowing(userId: string, politicianId: string) {
    return this.prisma.userPoliticianFollower.findUnique({
      where: { userId_politicianId: { userId, politicianId } },
    })
  }
}
