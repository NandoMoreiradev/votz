import { PostKind } from '@prisma/client'
import {
  computePostScores,
  rerankCandidatesForViewer,
  ViewerRankingContext,
} from './feed-ranking.service'

describe('FeedRankingService algorithm', () => {
  const now = Date.UTC(2026, 10, 16, 12, 0, 0)

  it('gives higher hotScore to advocacy/civic posts and applies time decay', () => {
    const recentCivic = computePostScores(
      {
        kind: PostKind.ADVOCACY,
        likesCount: 10,
        commentsCount: 4,
        uniqueCommenters: 4,
        repostsCount: 2,
        pollVotesCount: 0,
        hasMedia: true,
        hasReportMention: true,
        hasDebateMention: false,
        hasPropostaMention: false,
        authorVerified: true,
        authorEmailVerified: true,
        openFlagsCount: 0,
        createdAt: new Date(now - 2 * 3_600_000),
      },
      now,
    )

    const oldPlain = computePostScores(
      {
        kind: PostKind.STANDARD,
        likesCount: 10,
        commentsCount: 4,
        uniqueCommenters: 1,
        repostsCount: 0,
        pollVotesCount: 0,
        hasMedia: false,
        hasReportMention: false,
        hasDebateMention: false,
        hasPropostaMention: false,
        authorVerified: false,
        authorEmailVerified: true,
        openFlagsCount: 0,
        createdAt: new Date(now - 48 * 3_600_000),
      },
      now,
    )

    expect(recentCivic.hotScore).toBeGreaterThan(oldPlain.hotScore)
  })

  it('penalizes posts with open moderation flags', () => {
    const clean = computePostScores(
      {
        kind: PostKind.STANDARD,
        likesCount: 20,
        commentsCount: 5,
        uniqueCommenters: 5,
        repostsCount: 3,
        pollVotesCount: 0,
        hasMedia: false,
        hasReportMention: false,
        hasDebateMention: false,
        hasPropostaMention: false,
        authorVerified: false,
        authorEmailVerified: true,
        openFlagsCount: 0,
        createdAt: new Date(now - 3_600_000),
      },
      now,
    )

    const flagged = computePostScores(
      {
        kind: PostKind.STANDARD,
        likesCount: 20,
        commentsCount: 5,
        uniqueCommenters: 5,
        repostsCount: 3,
        pollVotesCount: 0,
        hasMedia: false,
        hasReportMention: false,
        hasDebateMention: false,
        hasPropostaMention: false,
        authorVerified: false,
        authorEmailVerified: true,
        openFlagsCount: 3,
        createdAt: new Date(now - 3_600_000),
      },
      now,
    )

    expect(flagged.hotScore).toBeLessThan(clean.hotScore)
  })

  it('boosts local/followed posts and enforces author diversity cap', () => {
    const viewer: ViewerRankingContext = {
      userId: 'u1',
      cityKey: 'sao paulo',
      state: 'SP',
      followedUserIds: new Set(['followed-user']),
      followedPoliticianIds: new Set(),
      followedEntityIds: new Set(),
      followedTopicIds: new Set(),
    }

    const candidates = [
      {
        id: 'spam-1',
        authorUserId: 'spammer',
        authorOrgType: null,
        authorOrgId: null,
        cityKey: 'curitiba',
        state: 'PR',
        hotScore: 1.0,
        createdAt: new Date(now),
        topicIds: [],
      },
      {
        id: 'spam-2',
        authorUserId: 'spammer',
        authorOrgType: null,
        authorOrgId: null,
        cityKey: 'curitiba',
        state: 'PR',
        hotScore: 0.99,
        createdAt: new Date(now - 1000),
        topicIds: [],
      },
      {
        id: 'local-followed',
        authorUserId: 'followed-user',
        authorOrgType: null,
        authorOrgId: null,
        cityKey: 'sao paulo',
        state: 'SP',
        hotScore: 0.5,
        createdAt: new Date(now - 2000),
        topicIds: [],
      },
    ]

    const ranked = rerankCandidatesForViewer(candidates, viewer)
    expect(ranked[0].id).toBe('local-followed')
    expect(ranked[1].id).toBe('spam-1')
    expect(ranked[2].id).toBe('spam-2')
  })
})
