import { Injectable } from '@nestjs/common'
import { Prisma, SurveyKind, SurveyScope, SurveyStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { type AggregateRowInput, type DecryptedBallotPayload } from './surveys.rules'

const QUESTION_INCLUDE = {
  orderBy: { position: 'asc' as const },
  include: {
    options: { orderBy: { position: 'asc' as const } },
  },
}

@Injectable()
export class SurveysRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPublicList(filters: {
    status?: SurveyStatus
    kind?: SurveyKind
    scope?: SurveyScope
    state?: string
  }) {
    const allowedStatuses: SurveyStatus[] = filters.status
      ? [filters.status].filter((s) => s === 'OPEN' || s === 'CLOSED' || s === 'ARCHIVED')
      : ['OPEN', 'CLOSED']

    return this.prisma.officialSurvey.findMany({
      where: {
        status: { in: allowedStatuses.length ? allowedStatuses : ['OPEN', 'CLOSED'] },
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.scope ? { scope: filters.scope } : {}),
        ...(filters.state ? { targetState: filters.state.toUpperCase() } : {}),
      },
      include: { institute: { select: { slug: true, name: true, logoUrl: true } } },
      orderBy: [{ status: 'asc' }, { featuredInFeed: 'desc' }, { startsAt: 'desc' }, { createdAt: 'desc' }],
    })
  }

  findFeaturedOpen(userState?: string | null) {
    return this.prisma.officialSurvey.findMany({
      where: {
        status: 'OPEN',
        featuredInFeed: true,
        distributionMode: 'OPEN',
        OR: [
          { scope: 'NATIONAL' },
          ...(userState ? [{ targetState: userState.toUpperCase() }] : []),
        ],
      },
      include: { institute: { select: { slug: true, name: true, logoUrl: true } } },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      take: 3,
    })
  }

  findAdminList() {
    return this.prisma.officialSurvey.findMany({
      orderBy: [{ reviewStatus: 'desc' }, { createdAt: 'desc' }],
      include: {
        institute: { select: { id: true, slug: true, name: true } },
        _count: {
          select: {
            questions: true,
            participations: true,
            pendingBallots: true,
            invitations: true,
          },
        },
      },
    })
  }

  findByIdOrSlugWithQuestions(idOrSlug: string) {
    return this.prisma.officialSurvey.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        questions: QUESTION_INCLUDE,
        institute: { select: { slug: true, name: true, logoUrl: true } },
      },
    })
  }

  findByIdWithQuestions(id: string) {
    return this.prisma.officialSurvey.findUnique({
      where: { id },
      include: { questions: QUESTION_INCLUDE },
    })
  }

  findById(id: string) {
    return this.prisma.officialSurvey.findUnique({ where: { id } })
  }

  findUserEligibilityFields(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        emailVerified: true,
        banned: true,
        createdAt: true,
        cpf: true,
        state: true,
        city: true,
        birthDate: true,
        gender: true,
      },
    })
  }

  async hasParticipation(surveyId: string, nullifierHash: string): Promise<boolean> {
    const row = await this.prisma.officialSurveyParticipation.findUnique({
      where: { surveyId_nullifierHash: { surveyId, nullifierHash } },
      select: { id: true },
    })
    return row !== null
  }

  /**
   * Registra a participação (nullifier) e coloca a cédula cifrada na fila transitória
   * em uma única transação atômica. Nenhuma coluna liga `participation` a `pendingBallot`.
   */
  async recordParticipationAndQueueBallot(params: {
    surveyId: string
    nullifierHash: string
    bucket: Date
    payloadEnc: string
  }): Promise<{ pendingCount: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.officialSurveyParticipation.create({
        data: {
          surveyId: params.surveyId,
          nullifierHash: params.nullifierHash,
          participatedBucket: params.bucket,
        },
      })

      await tx.officialSurveyPendingBallot.create({
        data: {
          surveyId: params.surveyId,
          payloadEnc: params.payloadEnc,
          queuedBucket: params.bucket,
        },
      })

      const pendingCount = await tx.officialSurveyPendingBallot.count({
        where: { surveyId: params.surveyId },
      })

      return { pendingCount }
    })
  }

  findPendingBallots(surveyId: string) {
    return this.prisma.officialSurveyPendingBallot.findMany({
      where: { surveyId },
      select: { id: true, payloadEnc: true },
    })
  }

  findOpenSurveysForSweep(now: Date) {
    return this.prisma.officialSurvey.findMany({
      where: { status: 'OPEN' },
      select: { id: true, endsAt: true },
    })
  }

  findScheduledToOpen(now: Date) {
    return this.prisma.officialSurvey.findMany({
      where: { status: 'SCHEDULED', startsAt: { lte: now } },
      select: { id: true },
    })
  }

  /**
   * Drena as cédulas já decifradas e embaralhadas para `OfficialSurveyBallot`,
   * remove as `PendingBallot` processadas e recalcula os agregados da pesquisa
   * em uma única transação atômica.
   */
  async commitShuffledBallotsAndRefreshAggregates(params: {
    surveyId: string
    pendingIds: string[]
    shuffledBallots: DecryptedBallotPayload[]
    computeAggregates: (
      ballots: {
        answersJson: unknown
        ageBand: string | null
        gender: string | null
        state: string | null
      }[],
    ) => AggregateRowInput[]
  }): Promise<{ committed: number; totalBallots: number }> {
    return this.prisma.$transaction(async (tx) => {
      if (params.shuffledBallots.length > 0) {
        await tx.officialSurveyBallot.createMany({
          data: params.shuffledBallots.map((b) => ({
            surveyId: params.surveyId,
            answersJson: b.answers as Prisma.InputJsonValue,
            ageBand: b.ageBand,
            gender: b.gender,
            state: b.state,
            ibgeCode: b.ibgeCode,
            submittedBucket: new Date(b.submittedBucket),
          })),
        })
      }

      if (params.pendingIds.length > 0) {
        await tx.officialSurveyPendingBallot.deleteMany({
          where: { id: { in: params.pendingIds } },
        })
      }

      const allBallots = await tx.officialSurveyBallot.findMany({
        where: { surveyId: params.surveyId },
        select: { answersJson: true, ageBand: true, gender: true, state: true },
      })

      const aggregates = params.computeAggregates(allBallots)

      await tx.officialSurveyAggregate.deleteMany({
        where: { surveyId: params.surveyId },
      })

      if (aggregates.length > 0) {
        await tx.officialSurveyAggregate.createMany({
          data: aggregates.map((row) => ({
            surveyId: params.surveyId,
            questionId: row.questionId,
            optionId: row.optionId,
            segmentKey: row.segmentKey,
            votesCount: row.votesCount,
            segmentTotal: row.segmentTotal,
          })),
        })
      }

      await tx.officialSurvey.update({
        where: { id: params.surveyId },
        data: { totalBallots: allBallots.length },
      })

      return { committed: params.shuffledBallots.length, totalBallots: allBallots.length }
    })
  }

  findAggregates(surveyId: string) {
    return this.prisma.officialSurveyAggregate.findMany({
      where: { surveyId },
    })
  }

  createSurvey(data: Prisma.OfficialSurveyCreateInput) {
    return this.prisma.officialSurvey.create({
      data,
      include: { questions: QUESTION_INCLUDE },
    })
  }

  updateSurvey(id: string, data: Prisma.OfficialSurveyUpdateInput) {
    return this.prisma.officialSurvey.update({
      where: { id },
      data,
      include: { questions: QUESTION_INCLUDE },
    })
  }

  // ── Fase 2: Convites de amostra sorteada + Quarentena ────────────────────

  async hasActiveInvitation(surveyId: string, userId: string, now: Date = new Date()): Promise<boolean> {
    const inv = await this.prisma.officialSurveyInvitation.findUnique({
      where: { surveyId_userId: { surveyId, userId } },
      select: { status: true, expiresAt: true },
    })
    if (!inv || inv.status !== 'INVITED') return false
    if (inv.expiresAt && now > inv.expiresAt) return false
    return true
  }

  async markInvitationRespondedIfExists(surveyId: string, userId: string, bucket: Date): Promise<void> {
    await this.prisma.officialSurveyInvitation.updateMany({
      where: { surveyId, userId, status: 'INVITED' },
      data: { status: 'RESPONDED', respondedBucket: bucket },
    })
  }

  findUserPendingInvitations(userId: string, now: Date = new Date()) {
    return this.prisma.officialSurveyInvitation.findMany({
      where: {
        userId,
        status: 'INVITED',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        survey: { status: 'OPEN' },
      },
      include: {
        survey: {
          include: { institute: { select: { slug: true, name: true, logoUrl: true } } },
        },
      },
      orderBy: { invitedAt: 'desc' },
    })
  }

  declineInvitation(invitationId: string, userId: string) {
    return this.prisma.officialSurveyInvitation.updateMany({
      where: { id: invitationId, userId, status: 'INVITED' },
      data: { status: 'DECLINED' },
    })
  }

  /**
   * Busca IDs de cidadãos elegíveis para sorteio de amostra (`INVITED_SAMPLE`),
   * excluindo automaticamente quem já recebeu convite nesta pesquisa OU em qualquer
   * pesquisa com o mesmo `topicKey` dentro da janela de quarentena (`cooldownCutoff`).
   */
  async findEligibleCandidateIdsForSample(params: {
    surveyId: string
    topicKey: string | null
    cooldownCutoff: Date
    scope: SurveyScope
    targetState: string | null
    targetCity: string | null
    requireCpf: boolean
    minAccountCreatedBefore: Date
    limit: number
  }): Promise<string[]> {
    const excludedRows = await this.prisma.officialSurveyInvitation.findMany({
      where: {
        OR: [
          { surveyId: params.surveyId },
          ...(params.topicKey
            ? [{ topicKey: params.topicKey, invitedAt: { gte: params.cooldownCutoff } }]
            : []),
        ],
      },
      select: { userId: true },
      distinct: ['userId'],
    })
    const excludedIds = excludedRows.map((r) => r.userId)

    const users = await this.prisma.user.findMany({
      where: {
        banned: false,
        emailVerified: true,
        createdAt: { lte: params.minAccountCreatedBefore },
        ...(params.requireCpf ? { cpf: { not: null } } : {}),
        ...(params.scope === 'STATE' && params.targetState ? { state: params.targetState.toUpperCase() } : {}),
        ...(params.scope === 'MUNICIPAL' && params.targetState && params.targetCity
          ? { state: params.targetState.toUpperCase(), city: { equals: params.targetCity, mode: 'insensitive' } }
          : {}),
        ...(excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {}),
      },
      select: { id: true },
      take: params.limit,
    })

    return users.map((u) => u.id)
  }

  async createSampleInvitations(params: {
    surveyId: string
    topicKey: string | null
    userIds: string[]
    expiresAt: Date | null
  }): Promise<number> {
    if (params.userIds.length === 0) return 0
    const res = await this.prisma.officialSurveyInvitation.createMany({
      data: params.userIds.map((userId) => ({
        surveyId: params.surveyId,
        userId,
        topicKey: params.topicKey,
        status: 'INVITED',
        expiresAt: params.expiresAt,
      })),
      skipDuplicates: true,
    })
    return res.count
  }

  // ── Fase 2: Entidades (Consultas Públicas) ────────────────────────────────

  async isActiveEntityMember(entityId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.orgMembership.findFirst({
      where: {
        orgType: 'ENTITY',
        orgId: entityId,
        userId,
        status: 'ACTIVE',
      },
      select: { id: true },
    })
    return member !== null
  }

  findEntityBasic(entityId: string) {
    return this.prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, legalName: true, city: true, state: true, ibgeCode: true, logoUrl: true },
    })
  }

  findByEntityId(entityId: string) {
    return this.prisma.officialSurvey.findMany({
      where: { sponsorEntityId: entityId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { questions: true, participations: true } },
      },
    })
  }

  // ── Fase 2: Institutos Credenciados & Comparador ──────────────────────────

  listInstitutes(onlyActive = true) {
    return this.prisma.researchInstitute.findMany({
      where: onlyActive ? { active: true } : undefined,
      orderBy: [{ verified: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            surveys: { where: { status: { in: ['OPEN', 'CLOSED', 'ARCHIVED'] } } },
          },
        },
      },
    })
  }

  findInstituteBySlug(slug: string) {
    return this.prisma.researchInstitute.findUnique({
      where: { slug },
      include: {
        surveys: {
          where: { status: { in: ['OPEN', 'CLOSED', 'ARCHIVED'] } },
          orderBy: [{ closedAt: 'desc' }, { startsAt: 'desc' }],
          include: { institute: { select: { slug: true, name: true, logoUrl: true } } },
        },
      },
    })
  }

  createInstitute(data: Prisma.ResearchInstituteCreateInput) {
    return this.prisma.researchInstitute.create({ data })
  }

  findClosedByTopicKey(topicKey: string) {
    return this.prisma.officialSurvey.findMany({
      where: {
        topicKey,
        status: { in: ['CLOSED', 'ARCHIVED'] },
      },
      orderBy: [{ closedAt: 'desc' }, { startsAt: 'desc' }],
      include: {
        institute: { select: { slug: true, name: true } },
        questions: QUESTION_INCLUDE,
        aggregates: { where: { segmentKey: 'ALL' } },
      },
      take: 25,
    })
  }
}
