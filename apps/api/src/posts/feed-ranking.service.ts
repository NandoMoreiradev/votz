import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { FlagStatus, FlagTargetType, PostKind } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export const FEED_RANKING_QUEUE = 'feed-ranking'

const GRAVITY = 1.65
export const FEED_TRENDING_WINDOW_DAYS = 30
const BATCH_TX_CHUNK = 100
export const FEED_RANKING_INTERVAL_MINUTES = 10

export interface PostRankingSignals {
  kind: PostKind
  likesCount: number
  commentsCount: number
  uniqueCommenters: number
  repostsCount: number
  pollVotesCount: number
  hasMedia: boolean
  hasReportMention: boolean
  hasDebateMention: boolean
  hasPropostaMention: boolean
  authorVerified: boolean
  authorEmailVerified: boolean
  openFlagsCount: number
  createdAt: Date
}

export interface ViewerRankingContext {
  userId?: string
  /** Nome da cidade como a pessoa cadastrou (usado para sugerir perfis da cidade). */
  city?: string | null
  cityKey?: string | null
  state?: string | null
  followedUserIds: Set<string>
  followedPoliticianIds: Set<string>
  followedEntityIds: Set<string>
  followedTopicIds: Set<string>
}

export interface RankableCandidate {
  id: string
  authorUserId: string
  authorOrgType: string | null
  authorOrgId: string | null
  cityKey: string | null
  state: string | null
  hotScore: number
  createdAt: Date
  topicIds: string[]
}

export function computePostScores(signals: PostRankingSignals, nowMs = Date.now()): {
  engagementScore: number
  hotScore: number
} {
  const uniqueEngagement =
    Math.log1p(Math.max(0, signals.uniqueCommenters)) * 4.0 +
    Math.log1p(Math.max(0, signals.repostsCount)) * 3.2 +
    Math.log1p(Math.max(0, signals.pollVotesCount)) * 1.8 +
    Math.log1p(Math.max(0, signals.likesCount)) * 1.2 +
    Math.log1p(Math.max(0, signals.commentsCount)) * 0.4

  const civicBoost =
    (signals.kind === PostKind.ADVOCACY ? 3.5 : 0) +
    (signals.hasReportMention ? 2.0 : 0) +
    (signals.hasDebateMention ? 2.2 : 0) +
    (signals.hasPropostaMention ? 1.5 : 0) +
    (signals.hasMedia ? 1.0 : 0)

  const baseEngagement = uniqueEngagement + civicBoost

  const accountTrust = signals.authorVerified
    ? 1.15
    : signals.authorEmailVerified
      ? 1.0
      : 0.72
  const flagPenalty = Math.max(0.25, 1 - Math.max(0, signals.openFlagsCount) * 0.25)
  const trustMultiplier = accountTrust * flagPenalty

  const ageHours = Math.max(0, (nowMs - signals.createdAt.getTime()) / 3_600_000)
  const hotScore = ((baseEngagement + 0.5) * trustMultiplier) / Math.pow(ageHours + 2, GRAVITY)

  return {
    engagementScore: Math.round(baseEngagement * 100) / 100,
    hotScore: Math.round(hotScore * 10_000) / 10_000,
  }
}

export function isSameFeedCity(post: RankableCandidate, viewer: ViewerRankingContext): boolean {
  return !!viewer.cityKey && !!viewer.state && post.cityKey === viewer.cityKey && post.state === viewer.state
}

/**
 * Re-ranker personalizado em tempo de leitura:
 * aplica afinidade social, proximidade geográfica, pautas seguidas e
 * atenuação progressiva por frequência do mesmo autor (anti-monopólio).
 */
export function rerankCandidatesForViewer<T extends RankableCandidate>(
  candidates: T[],
  viewer: ViewerRankingContext,
): T[] {
  const scored = candidates.map((post) => {
    let personalBoost = 0

    if (viewer.followedUserIds.has(post.authorUserId)) {
      personalBoost += 4.0
    }
    if (post.authorOrgType === 'POLITICIAN' && post.authorOrgId && viewer.followedPoliticianIds.has(post.authorOrgId)) {
      personalBoost += 4.0
    }
    if (post.authorOrgType === 'ENTITY' && post.authorOrgId && viewer.followedEntityIds.has(post.authorOrgId)) {
      personalBoost += 4.0
    }
    if (post.topicIds.some((tid) => viewer.followedTopicIds.has(tid))) {
      personalBoost += 2.0
    }
    if (isSameFeedCity(post, viewer)) {
      personalBoost += 3.0
    } else if (viewer.state && post.state && viewer.state === post.state) {
      personalBoost += 1.2
    }

    const baseScore = post.hotScore * 10 + personalBoost
    return { post, baseScore }
  })

  // Ordenação inicial por relevância combinada, depois aplica diversity cap por autor
  scored.sort((a, b) => {
    if (b.baseScore !== a.baseScore) return b.baseScore - a.baseScore
    return b.post.createdAt.getTime() - a.post.createdAt.getTime() || a.post.id.localeCompare(b.post.id)
  })

  const authorSeenCount = new Map<string, number>()
  const diversified = scored.map(({ post, baseScore }) => {
    const authorKey =
      post.authorOrgType && post.authorOrgId
        ? `${post.authorOrgType}:${post.authorOrgId}`
        : `USER:${post.authorUserId}`
    const seen = authorSeenCount.get(authorKey) ?? 0
    authorSeenCount.set(authorKey, seen + 1)

    const diversityFactor = 1 / (1 + 0.55 * seen)
    return {
      post,
      finalScore: baseScore * diversityFactor,
    }
  })

  diversified.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
    return b.post.createdAt.getTime() - a.post.createdAt.getTime() || a.post.id.localeCompare(b.post.id)
  })

  return diversified.map((d) => d.post)
}

@Injectable()
export class FeedRankingService {
  private readonly logger = new Logger(FeedRankingService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @InjectQueue(FEED_RANKING_QUEUE) private readonly queue?: Queue,
  ) {}

  async enqueuePost(postId: string): Promise<void> {
    if (!this.queue) return
    await this.queue
      .add(
        'recalculate-post',
        { postId },
        {
          deduplication: { id: `post-${postId}`, keepLastIfActive: true },
          removeOnComplete: 200,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
        },
      )
      .catch((error: Error) => this.logger.warn(`Não foi possível agendar o recálculo do feed: ${error.message}`))
  }

  async enqueueBatch(): Promise<void> {
    if (!this.queue) return
    await this.queue
      .add(
        'recalculate-batch',
        {},
        {
          jobId: `feed-batch-${Math.floor(Date.now() / (FEED_RANKING_INTERVAL_MINUTES * 60_000))}`,
          deduplication: { id: 'feed-batch', keepLastIfActive: true },
          removeOnComplete: 10,
          removeOnFail: 10,
          attempts: 2,
          backoff: { type: 'fixed', delay: 30_000 },
        },
      )
      .catch((error: Error) => this.logger.warn(`Não foi possível agendar o recálculo do feed: ${error.message}`))
  }

  async recalculateOne(postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        kind: true,
        media: true,
        likesCount: true,
        commentsCount: true,
        repostsCount: true,
        mentionedReportId: true,
        mentionedDebateId: true,
        mentionedPropostaId: true,
        createdAt: true,
        authorUser: { select: { verified: true, emailVerified: true } },
        poll: { select: { totalVotes: true } },
      },
    })
    if (!post) return

    const [uniqueCommenterRows, openFlagsCount] = await Promise.all([
      this.prisma.postComment.findMany({
        where: { postId },
        distinct: ['authorId'],
        select: { authorId: true },
      }),
      this.prisma.contentFlag.count({
        where: {
          targetType: FlagTargetType.POST,
          targetId: postId,
          status: FlagStatus.OPEN,
        },
      }),
    ])

    const { engagementScore, hotScore } = computePostScores({
      kind: post.kind,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      uniqueCommenters: uniqueCommenterRows.length,
      repostsCount: post.repostsCount,
      pollVotesCount: post.poll?.totalVotes ?? 0,
      hasMedia: post.media.length > 0,
      hasReportMention: !!post.mentionedReportId,
      hasDebateMention: !!post.mentionedDebateId,
      hasPropostaMention: !!post.mentionedPropostaId,
      authorVerified: post.authorUser.verified,
      authorEmailVerified: post.authorUser.emailVerified,
      openFlagsCount,
      createdAt: post.createdAt,
    })

    await this.prisma.post.update({
      where: { id: postId },
      data: { engagementScore, hotScore },
    })
  }

  async recalculateBatch(): Promise<{ updated: number }> {
    const cutoff = new Date(Date.now() - FEED_TRENDING_WINDOW_DAYS * 86_400_000)
    const posts = await this.prisma.post.findMany({
      where: { createdAt: { gte: cutoff } },
      select: {
        id: true,
        kind: true,
        media: true,
        likesCount: true,
        commentsCount: true,
        repostsCount: true,
        mentionedReportId: true,
        mentionedDebateId: true,
        mentionedPropostaId: true,
        createdAt: true,
        authorUser: { select: { verified: true, emailVerified: true } },
        poll: { select: { totalVotes: true } },
      },
    })

    if (posts.length === 0) return { updated: 0 }

    const postIds = posts.map((p) => p.id)

    const [commentGroups, flagGroups] = await Promise.all([
      this.prisma.postComment.groupBy({
        by: ['postId', 'authorId'],
        where: { postId: { in: postIds } },
      }),
      this.prisma.contentFlag.groupBy({
        by: ['targetId'],
        where: {
          targetType: FlagTargetType.POST,
          targetId: { in: postIds },
          status: FlagStatus.OPEN,
        },
        _count: { _all: true },
      }),
    ])

    const uniqueCommentersMap = new Map<string, number>()
    for (const row of commentGroups) {
      uniqueCommentersMap.set(row.postId, (uniqueCommentersMap.get(row.postId) ?? 0) + 1)
    }

    const flagsMap = new Map<string, number>(
      flagGroups.map((f) => [f.targetId, f._count._all]),
    )

    const nowMs = Date.now()
    const updates = posts.map((post) => {
      const scores = computePostScores(
        {
          kind: post.kind,
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          uniqueCommenters: uniqueCommentersMap.get(post.id) ?? 0,
          repostsCount: post.repostsCount,
          pollVotesCount: post.poll?.totalVotes ?? 0,
          hasMedia: post.media.length > 0,
          hasReportMention: !!post.mentionedReportId,
          hasDebateMention: !!post.mentionedDebateId,
          hasPropostaMention: !!post.mentionedPropostaId,
          authorVerified: post.authorUser.verified,
          authorEmailVerified: post.authorUser.emailVerified,
          openFlagsCount: flagsMap.get(post.id) ?? 0,
          createdAt: post.createdAt,
        },
        nowMs,
      )
      return { id: post.id, ...scores }
    })

    for (let i = 0; i < updates.length; i += BATCH_TX_CHUNK) {
      const chunk = updates.slice(i, i + BATCH_TX_CHUNK)
      await this.prisma.$transaction(
        chunk.map((u) =>
          this.prisma.post.update({
            where: { id: u.id },
            data: { engagementScore: u.engagementScore, hotScore: u.hotScore },
          }),
        ),
      )
    }

    this.logger.log(`Feed ranking batch complete: ${updates.length} posts updated`)
    return { updated: updates.length }
  }
}
