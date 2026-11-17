import { Injectable } from '@nestjs/common'
import {
  ModerationActionType,
  OrgType,
  PostCommentMediaType,
  PostKind,
  Prisma,
} from '@prisma/client'
import { PostAuthorInfo, PostCommentDto, PostDto, UserType } from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { ViewerRankingContext } from './feed-ranking.service'

const POST_INCLUDE = {
  authorUser: {
    select: { id: true, name: true, username: true, avatarUrl: true, verified: true, type: true },
  },
  poll: {
    include: {
      options: { orderBy: { position: 'asc' as const } },
    },
  },
  mentionedReport: {
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
      _count: { select: { votes: true, comments: true } },
    },
  },
  mentionedDebate: {
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
  mentionedProposta: {
    select: {
      id: true,
      titulo: true,
      status: true,
      politico: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  mentionedDebatePoll: {
    select: {
      id: true,
      debateId: true,
      question: true,
      active: true,
      debate: { select: { title: true } },
      options: { select: { id: true, text: true, totalVotes: true } },
    },
  },
  quotePost: {
    select: {
      id: true,
      content: true,
      kind: true,
      media: true,
      createdAt: true,
      authorUserId: true,
      authorOrgType: true,
      authorOrgId: true,
      authorUser: {
        select: { id: true, name: true, username: true, avatarUrl: true, verified: true, type: true },
      },
    },
  },
  topics: {
    select: {
      topic: { select: { id: true, slug: true, displayTag: true } },
    },
  },
} satisfies Prisma.PostInclude

type RawPost = Prisma.PostGetPayload<{ include: typeof POST_INCLUDE }>

const COMMENT_AUTHOR_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  verified: true,
  type: true,
} as const

export interface ViewerIdentity {
  userId?: string
  activeOrgType?: string | null
  activeOrgId?: string | null
}

interface OrgMeta {
  name: string
  avatarUrl: string | null
  verified: boolean
  subtitle: string | null
}

@Injectable()
export class PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPost(data: {
    content: string
    kind: PostKind
    media: string[]
    mediaKeys: string[]
    authorUserId: string
    authorOrgType?: OrgType | null
    authorOrgId?: string | null
    city?: string | null
    cityKey?: string | null
    state?: string | null
    mentionedReportId?: string | null
    mentionedDebateId?: string | null
    mentionedPropostaId?: string | null
    mentionedDebatePollId?: string | null
    quotePostId?: string | null
    hotScore?: number
    poll?: {
      question?: string | null
      expiresAt: Date
      options: string[]
    }
  }) {
    return this.prisma.post.create({
      data: {
        content: data.content,
        kind: data.kind,
        media: data.media,
        mediaKeys: data.mediaKeys,
        authorUserId: data.authorUserId,
        authorOrgType: data.authorOrgType ?? null,
        authorOrgId: data.authorOrgId ?? null,
        city: data.city ?? null,
        cityKey: data.cityKey ?? null,
        state: data.state ?? null,
        mentionedReportId: data.mentionedReportId ?? null,
        mentionedDebateId: data.mentionedDebateId ?? null,
        mentionedPropostaId: data.mentionedPropostaId ?? null,
        mentionedDebatePollId: data.mentionedDebatePollId ?? null,
        quotePostId: data.quotePostId ?? null,
        hotScore: data.hotScore ?? 0.5,
        poll: data.poll
          ? {
              create: {
                question: data.poll.question ?? null,
                expiresAt: data.poll.expiresAt,
                options: {
                  create: data.poll.options.map((text, index) => ({
                    text,
                    position: index,
                  })),
                },
              },
            }
          : undefined,
      },
      include: POST_INCLUDE,
    })
  }

  findRawById(id: string) {
    return this.prisma.post.findUnique({
      where: { id },
      include: POST_INCLUDE,
    })
  }

  async findFeedCandidates(params: {
    sort: 'for_you' | 'trending' | 'following' | 'recent'
    topicSlug?: string
    cityKey?: string
    state?: string
    kind?: PostKind
    authorType?: 'CITIZEN' | 'POLITICIAN' | 'ENTITY'
    authorUserId?: string
    authorOrgId?: string
    hasPoll?: boolean
    viewerContext?: ViewerRankingContext
    page: number
    limit: number
  }) {
    const where: Prisma.PostWhereInput = {}

    if (params.topicSlug) {
      where.topics = { some: { topic: { slug: params.topicSlug } } }
    }
    if (params.cityKey) where.cityKey = params.cityKey
    if (params.state) where.state = params.state
    if (params.kind) where.kind = params.kind
    if (params.authorUserId) where.authorUserId = params.authorUserId
    if (params.authorOrgId) where.authorOrgId = params.authorOrgId
    if (params.hasPoll) where.poll = { isNot: null }

    if (params.authorType === 'CITIZEN') {
      where.authorOrgType = null
    } else if (params.authorType === 'POLITICIAN') {
      where.authorOrgType = OrgType.POLITICIAN
    } else if (params.authorType === 'ENTITY') {
      where.authorOrgType = OrgType.ENTITY
    }

    if (params.sort === 'following' && params.viewerContext) {
      const orClauses: Prisma.PostWhereInput[] = []
      if (params.viewerContext.followedUserIds.size > 0) {
        orClauses.push({ authorUserId: { in: Array.from(params.viewerContext.followedUserIds) } })
      }
      if (params.viewerContext.followedPoliticianIds.size > 0) {
        orClauses.push({
          authorOrgType: OrgType.POLITICIAN,
          authorOrgId: { in: Array.from(params.viewerContext.followedPoliticianIds) },
        })
      }
      if (params.viewerContext.followedEntityIds.size > 0) {
        orClauses.push({
          authorOrgType: OrgType.ENTITY,
          authorOrgId: { in: Array.from(params.viewerContext.followedEntityIds) },
        })
      }
      if (params.viewerContext.followedTopicIds.size > 0) {
        orClauses.push({
          topics: { some: { topicId: { in: Array.from(params.viewerContext.followedTopicIds) } } },
        })
      }
      if (orClauses.length === 0) {
        return { posts: [], total: 0 }
      }
      where.OR = orClauses
    }

    if (params.sort === 'for_you') {
      const [candidates, total] = await Promise.all([
        this.prisma.post.findMany({
          where,
          include: POST_INCLUDE,
          orderBy: [{ hotScore: 'desc' }, { createdAt: 'desc' }],
          take: 150,
        }),
        this.prisma.post.count({ where }),
      ])
      return { posts: candidates, total }
    }

    const skip = (params.page - 1) * params.limit
    const orderBy: Prisma.PostOrderByWithRelationInput[] =
      params.sort === 'trending'
        ? [{ hotScore: 'desc' }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }]

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: POST_INCLUDE,
        orderBy,
        skip,
        take: params.limit,
      }),
      this.prisma.post.count({ where }),
    ])

    return { posts, total }
  }

  async getViewerContext(userId?: string): Promise<ViewerRankingContext> {
    if (!userId) {
      return {
        followedUserIds: new Set(),
        followedPoliticianIds: new Set(),
        followedEntityIds: new Set(),
        followedTopicIds: new Set(),
      }
    }

    const [user, userFollows, polFollows, entFollows, topicFollows] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { city: true, state: true },
      }),
      this.prisma.userFollow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      }),
      this.prisma.userPoliticianFollower.findMany({
        where: { userId },
        select: { politicianId: true },
      }),
      this.prisma.userEntityFollower.findMany({
        where: { userId },
        select: { entityId: true },
      }),
      this.prisma.userTopicFollower.findMany({
        where: { userId },
        select: { topicId: true },
      }),
    ])

    const cityKey = user?.city
      ? user.city
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
      : null

    return {
      userId,
      cityKey,
      state: user?.state ?? null,
      followedUserIds: new Set(userFollows.map((f) => f.followingId)),
      followedPoliticianIds: new Set(polFollows.map((f) => f.politicianId)),
      followedEntityIds: new Set(entFollows.map((f) => f.entityId)),
      followedTopicIds: new Set(topicFollows.map((f) => f.topicId)),
    }
  }

  async hydratePosts(posts: RawPost[], viewer: ViewerIdentity): Promise<PostDto[]> {
    if (posts.length === 0) return []

    const orgRefs: Array<{ orgType: OrgType | null; orgId: string | null }> = []
    for (const p of posts) {
      orgRefs.push({ orgType: p.authorOrgType, orgId: p.authorOrgId })
      if (p.quotePost) {
        orgRefs.push({ orgType: p.quotePost.authorOrgType, orgId: p.quotePost.authorOrgId })
      }
    }

    const orgMap = await this.loadOrgMap(orgRefs)

    const postIds = posts.map((p) => p.id)
    const pollIds = posts.map((p) => p.poll?.id).filter((id): id is string => !!id)
    const debatePollIds = posts
      .map((p) => p.mentionedDebatePoll?.id)
      .filter((id): id is string => !!id)

    const [likes, reposts, pollVotes, debatePollVotes] = viewer.userId
      ? await Promise.all([
          this.prisma.postLike.findMany({
            where: { userId: viewer.userId, postId: { in: postIds } },
            select: { postId: true },
          }),
          this.prisma.postRepost.findMany({
            where: { userId: viewer.userId, postId: { in: postIds } },
            select: { postId: true },
          }),
          pollIds.length > 0
            ? this.prisma.postPollVote.findMany({
                where: { userId: viewer.userId, pollId: { in: pollIds } },
                select: { pollId: true, optionId: true },
              })
            : Promise.resolve([]),
          debatePollIds.length > 0
            ? this.prisma.debatePollVote.findMany({
                where: { userId: viewer.userId, pollId: { in: debatePollIds } },
                select: { pollId: true, optionId: true },
              })
            : Promise.resolve([]),
        ])
      : [[], [], [], []]

    const likedSet = new Set(likes.map((l) => l.postId))
    const repostedSet = new Set(reposts.map((r) => r.postId))
    const pollVoteMap = new Map(pollVotes.map((v) => [v.pollId, v.optionId]))
    const debatePollVoteMap = new Map(debatePollVotes.map((v) => [v.pollId, v.optionId]))

    return posts.map((p) => {
      const author = this.buildAuthorInfo(p.authorUser, p.authorOrgType, p.authorOrgId, orgMap)
      const canCommentWithAudio = this.canViewerUseAudio(p, viewer)

      return {
        id: p.id,
        content: p.content,
        kind: p.kind as PostDto['kind'],
        media: p.media,
        city: p.city,
        state: p.state,
        likesCount: p.likesCount,
        commentsCount: p.commentsCount,
        repostsCount: p.repostsCount,
        likedByMe: likedSet.has(p.id),
        repostedByMe: repostedSet.has(p.id),
        canCommentWithAudio,
        hotScore: p.hotScore,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        author,
        poll: p.poll
          ? {
              id: p.poll.id,
              question: p.poll.question,
              expiresAt: p.poll.expiresAt.toISOString(),
              expired: p.poll.expiresAt.getTime() <= Date.now(),
              totalVotes: p.poll.totalVotes,
              myVoteOptionId: pollVoteMap.get(p.poll.id) ?? null,
              options: p.poll.options.map((o) => ({
                id: o.id,
                text: o.text,
                position: o.position,
                votesCount: o.votesCount,
              })),
            }
          : null,
        mentionedReport: p.mentionedReport
          ? {
              ...p.mentionedReport,
              category: p.mentionedReport.category as PostDto['mentionedReport'] extends infer R
                ? R extends { category: infer C }
                  ? C
                  : never
                : never,
              status: p.mentionedReport.status as PostDto['mentionedReport'] extends infer R
                ? R extends { status: infer S }
                  ? S
                  : never
                : never,
            }
          : null,
        mentionedDebate: p.mentionedDebate
          ? {
              ...p.mentionedDebate,
              scheduledFor: p.mentionedDebate.scheduledFor.toISOString(),
            }
          : null,
        mentionedProposta: p.mentionedProposta ?? null,
        mentionedDebatePoll: p.mentionedDebatePoll
          ? {
              id: p.mentionedDebatePoll.id,
              debateId: p.mentionedDebatePoll.debateId,
              debateTitle: p.mentionedDebatePoll.debate.title,
              question: p.mentionedDebatePoll.question,
              active: p.mentionedDebatePoll.active,
              myVoteOptionId: debatePollVoteMap.get(p.mentionedDebatePoll.id) ?? null,
              options: p.mentionedDebatePoll.options,
            }
          : null,
        quotePost: p.quotePost
          ? {
              id: p.quotePost.id,
              content: p.quotePost.content,
              kind: p.quotePost.kind as PostDto['kind'],
              media: p.quotePost.media,
              createdAt: p.quotePost.createdAt.toISOString(),
              author: this.buildAuthorInfo(
                p.quotePost.authorUser,
                p.quotePost.authorOrgType,
                p.quotePost.authorOrgId,
                orgMap,
              ),
            }
          : null,
        topics: p.topics.map((t) => t.topic),
      }
    })
  }

  canViewerUseAudio(
    post: { authorUserId: string; authorOrgType: OrgType | null; authorOrgId: string | null },
    viewer: ViewerIdentity,
  ): boolean {
    if (!viewer.userId) return false
    if (post.authorOrgType && post.authorOrgId) {
      return viewer.activeOrgType === post.authorOrgType && viewer.activeOrgId === post.authorOrgId
    }
    return viewer.userId === post.authorUserId && !viewer.activeOrgType
  }

  async loadOrgMap(refs: Array<{ orgType: OrgType | null; orgId: string | null }>): Promise<Map<string, OrgMeta>> {
    const polIds = Array.from(
      new Set(refs.filter((r) => r.orgType === OrgType.POLITICIAN && r.orgId).map((r) => r.orgId!)),
    )
    const entIds = Array.from(
      new Set(refs.filter((r) => r.orgType === OrgType.ENTITY && r.orgId).map((r) => r.orgId!)),
    )
    const compIds = Array.from(
      new Set(refs.filter((r) => r.orgType === OrgType.COMPANY && r.orgId).map((r) => r.orgId!)),
    )

    const [pols, ents, comps] = await Promise.all([
      polIds.length > 0
        ? this.prisma.politician.findMany({
            where: { id: { in: polIds } },
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              verified: true,
              office: true,
              party: { select: { abbreviation: true } },
            },
          })
        : Promise.resolve([]),
      entIds.length > 0
        ? this.prisma.entity.findMany({
            where: { id: { in: entIds } },
            select: { id: true, legalName: true, logoUrl: true, verified: true, city: true, state: true },
          })
        : Promise.resolve([]),
      compIds.length > 0
        ? this.prisma.company.findMany({
            where: { id: { in: compIds } },
            select: { id: true, tradeName: true, logoUrl: true, verified: true },
          })
        : Promise.resolve([]),
    ])

    const map = new Map<string, OrgMeta>()
    for (const p of pols) {
      map.set(`POLITICIAN:${p.id}`, {
        name: p.name,
        avatarUrl: p.avatarUrl,
        verified: p.verified,
        subtitle: `${p.party.abbreviation} · ${p.office}`,
      })
    }
    for (const e of ents) {
      map.set(`ENTITY:${e.id}`, {
        name: e.legalName,
        avatarUrl: e.logoUrl,
        verified: e.verified,
        subtitle: [e.city, e.state].filter(Boolean).join(' · ') || 'Entidade',
      })
    }
    for (const c of comps) {
      map.set(`COMPANY:${c.id}`, {
        name: c.tradeName,
        avatarUrl: c.logoUrl,
        verified: c.verified,
        subtitle: 'Empresa',
      })
    }
    return map
  }

  buildAuthorInfo(
    user: { id: string; name: string; username?: string | null; avatarUrl: string | null; verified: boolean; type: string },
    orgType: OrgType | null,
    orgId: string | null,
    orgMap: Map<string, OrgMeta>,
  ): PostAuthorInfo {
    const org = orgType && orgId ? orgMap.get(`${orgType}:${orgId}`) : undefined
    return {
      userId: user.id,
      name: user.name,
      username: user.username ?? null,
      avatarUrl: user.avatarUrl,
      verified: user.verified,
      userType: user.type as UserType,
      orgType: (orgType as PostAuthorInfo['orgType']) ?? null,
      orgId: orgId ?? null,
      orgName: org?.name ?? null,
      orgAvatarUrl: org?.avatarUrl ?? null,
      orgVerified: org?.verified ?? false,
      orgSubtitle: org?.subtitle ?? null,
    }
  }

  async toggleLike(postId: string, userId: string) {
    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    })

    if (existing) {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.postLike.delete({ where: { id: existing.id } }),
        this.prisma.post.update({
          where: { id: postId },
          data: { likesCount: { decrement: 1 } },
          select: { likesCount: true },
        }),
      ])
      return { liked: false, likesCount: Math.max(0, updated.likesCount) }
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.postLike.create({ data: { postId, userId } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 }, lastEngagedAt: new Date() },
        select: { likesCount: true },
      }),
    ])
    return { liked: true, likesCount: updated.likesCount }
  }

  async toggleRepost(postId: string, userId: string) {
    const existing = await this.prisma.postRepost.findUnique({
      where: { postId_userId: { postId, userId } },
    })

    if (existing) {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.postRepost.delete({ where: { id: existing.id } }),
        this.prisma.post.update({
          where: { id: postId },
          data: { repostsCount: { decrement: 1 } },
          select: { repostsCount: true },
        }),
      ])
      return { reposted: false, repostsCount: Math.max(0, updated.repostsCount) }
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.postRepost.create({ data: { postId, userId } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { repostsCount: { increment: 1 }, lastEngagedAt: new Date() },
        select: { repostsCount: true },
      }),
    ])
    return { reposted: true, repostsCount: updated.repostsCount }
  }

  async votePoll(pollId: string, optionId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.postPollVote.create({
        data: { pollId, optionId, userId },
      })
      await tx.postPollOption.update({
        where: { id: optionId },
        data: { votesCount: { increment: 1 } },
      })
      return tx.postPoll.update({
        where: { id: pollId },
        data: { totalVotes: { increment: 1 } },
        include: { options: { orderBy: { position: 'asc' } } },
      })
    })
  }

  async createComment(data: {
    postId: string
    authorId: string
    authorOrgType?: OrgType | null
    authorOrgId?: string | null
    parentId?: string
    content: string
    mediaType: PostCommentMediaType
    mediaUrl?: string
    mediaKey?: string
    mediaDuration?: number
  }): Promise<PostCommentDto> {
    const [comment] = await this.prisma.$transaction([
      this.prisma.postComment.create({
        data: {
          postId: data.postId,
          authorId: data.authorId,
          authorOrgType: data.authorOrgType ?? null,
          authorOrgId: data.authorOrgId ?? null,
          parentId: data.parentId ?? null,
          content: data.content,
          mediaType: data.mediaType,
          mediaUrl: data.mediaUrl ?? null,
          mediaKey: data.mediaKey ?? null,
          mediaDuration: data.mediaDuration ?? null,
        },
        include: {
          author: { select: COMMENT_AUTHOR_SELECT },
          _count: { select: { replies: true } },
        },
      }),
      this.prisma.post.update({
        where: { id: data.postId },
        data: { commentsCount: { increment: 1 }, lastEngagedAt: new Date() },
      }),
    ])

    const orgMap = await this.loadOrgMap([
      { orgType: comment.authorOrgType, orgId: comment.authorOrgId },
    ])

    return {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      content: comment.content,
      mediaType: comment.mediaType as PostCommentDto['mediaType'],
      mediaUrl: comment.mediaUrl,
      mediaDuration: comment.mediaDuration,
      transcript: comment.transcript,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      author: this.buildAuthorInfo(
        comment.author,
        comment.authorOrgType,
        comment.authorOrgId,
        orgMap,
      ),
      _count: comment._count,
      replies: [],
    }
  }

  async findCommentsByPost(postId: string): Promise<PostCommentDto[]> {
    const rows = await this.prisma.postComment.findMany({
      where: { postId, parentId: null },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: COMMENT_AUTHOR_SELECT },
        _count: { select: { replies: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: COMMENT_AUTHOR_SELECT },
            _count: { select: { replies: true } },
          },
        },
      },
    })

    const orgRefs: Array<{ orgType: OrgType | null; orgId: string | null }> = []
    for (const c of rows) {
      orgRefs.push({ orgType: c.authorOrgType, orgId: c.authorOrgId })
      for (const r of c.replies) {
        orgRefs.push({ orgType: r.authorOrgType, orgId: r.authorOrgId })
      }
    }

    const orgMap = await this.loadOrgMap(orgRefs)

    return rows.map((c) => ({
      id: c.id,
      postId: c.postId,
      parentId: c.parentId,
      content: c.content,
      mediaType: c.mediaType as PostCommentDto['mediaType'],
      mediaUrl: c.mediaUrl,
      mediaDuration: c.mediaDuration,
      transcript: c.transcript,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      author: this.buildAuthorInfo(c.author, c.authorOrgType, c.authorOrgId, orgMap),
      _count: c._count,
      replies: c.replies.map((r) => ({
        id: r.id,
        postId: r.postId,
        parentId: r.parentId,
        content: r.content,
        mediaType: r.mediaType as PostCommentDto['mediaType'],
        mediaUrl: r.mediaUrl,
        mediaDuration: r.mediaDuration,
        transcript: r.transcript,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        author: this.buildAuthorInfo(r.author, r.authorOrgType, r.authorOrgId, orgMap),
        _count: r._count,
      })),
    }))
  }

  findCommentById(commentId: string) {
    return this.prisma.postComment.findUnique({
      where: { id: commentId },
      include: {
        author: { select: { id: true, email: true, name: true } },
        replies: { select: { id: true, mediaKey: true } },
      },
    })
  }

  async deletePost(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        mediaKeys: true,
        authorUser: { select: { email: true, name: true } },
        comments: { select: { mediaKey: true } },
        topics: { select: { topicId: true } },
      },
    })
    if (!post) return null

    await this.prisma.post.delete({ where: { id } })
    return {
      post,
      allMediaKeys: [
        ...post.mediaKeys,
        ...post.comments.map((c) => c.mediaKey).filter((k): k is string => !!k),
      ],
    }
  }

  async deletePostWithAudit(id: string, actorId: string, reason: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        mediaKeys: true,
        authorUser: { select: { email: true, name: true } },
        comments: { select: { mediaKey: true } },
      },
    })
    if (!post) return null

    const [, action] = await this.prisma.$transaction([
      this.prisma.post.delete({ where: { id } }),
      this.prisma.moderationAction.create({
        data: {
          action: ModerationActionType.POST_REMOVED,
          targetType: 'POST',
          targetId: id,
          reason,
          actorId,
        },
        select: { id: true },
      }),
    ])

    return {
      actionId: action.id,
      author: post.authorUser,
      allMediaKeys: [
        ...post.mediaKeys,
        ...post.comments.map((c) => c.mediaKey).filter((k): k is string => !!k),
      ],
    }
  }

  async deleteComment(commentId: string, postId: string) {
    const repliesCount = await this.prisma.postComment.count({ where: { parentId: commentId } })
    await this.prisma.$transaction([
      this.prisma.postComment.delete({ where: { id: commentId } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { decrement: 1 + repliesCount } },
      }),
    ])
  }

  async deleteCommentWithAudit(commentId: string, postId: string, actorId: string, reason: string) {
    const repliesCount = await this.prisma.postComment.count({ where: { parentId: commentId } })
    const [, , action] = await this.prisma.$transaction([
      this.prisma.postComment.delete({ where: { id: commentId } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { decrement: 1 + repliesCount } },
      }),
      this.prisma.moderationAction.create({
        data: {
          action: ModerationActionType.POST_COMMENT_REMOVED,
          targetType: 'POST_COMMENT',
          targetId: commentId,
          reason,
          actorId,
        },
        select: { id: true },
      }),
    ])
    return { actionId: action.id }
  }
}
