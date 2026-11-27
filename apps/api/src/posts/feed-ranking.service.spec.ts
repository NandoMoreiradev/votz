import { PostKind } from '@prisma/client'
import {
  computePostScores,
  FeedRankingService,
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

describe('FeedRankingService scheduling', () => {
  it('deduplica o lote entre instâncias na mesma janela sem bloquear a próxima', async () => {
    jest.useFakeTimers()
    try {
      const add = jest.fn().mockResolvedValue(undefined)
      const service = new FeedRankingService({} as never, { add } as never)
      jest.setSystemTime(new Date('2026-11-27T15:00:00Z'))
      await service.enqueueBatch()
      await service.enqueueBatch()
      jest.setSystemTime(new Date('2026-11-27T15:10:00Z'))
      await service.enqueueBatch()

      const options = add.mock.calls.map((call) => call[2])
      expect(options[0].jobId).toBe(options[1].jobId)
      expect(options[2].jobId).not.toBe(options[0].jobId)
      expect(options[2].deduplication).toEqual({ id: 'feed-batch', keepLastIfActive: true })
    } finally {
      jest.useRealTimers()
    }
  })

  it('mantém o último recálculo individual sem reutilizar o ID de um job encerrado', async () => {
    const add = jest.fn().mockResolvedValue(undefined)
    const service = new FeedRankingService({} as never, { add } as never)
    await service.enqueuePost('post')
    const options = add.mock.calls[0][2]
    expect(options).not.toHaveProperty('jobId')
    expect(options.deduplication).toEqual({ id: 'post-post', keepLastIfActive: true })
  })
})
