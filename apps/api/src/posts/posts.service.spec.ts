import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { OrgType, PostCommentMediaType } from '@prisma/client'

jest.mock('isomorphic-dompurify', () => ({
  sanitize: (s: string) => s,
}))

import { PostsService } from './posts.service'

describe('PostsService', () => {
  function makeService(overrides: Record<string, unknown> = {}) {
    const repo = {
      canViewerUseAudio: jest.fn((post, viewer) => {
        if (!viewer.userId) return false
        if (post.authorOrgType && post.authorOrgId) {
          return viewer.activeOrgType === post.authorOrgType && viewer.activeOrgId === post.authorOrgId
        }
        return viewer.userId === post.authorUserId && !viewer.activeOrgType
      }),
      createComment: jest.fn().mockResolvedValue({ id: 'c1', postId: 'p1' }),
      createPost: jest.fn().mockResolvedValue({ id: 'p1' }),
      findRawById: jest.fn().mockResolvedValue({ id: 'p1' }),
      hydratePosts: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      ...(overrides.repo as object),
    }

    const prisma = {
      post: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          authorUserId: 'author-1',
          authorOrgType: null,
          authorOrgId: null,
        }),
      },
      orgMembership: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          role: { permissions: [] },
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ city: 'São Paulo', state: 'SP' }) },
      report: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', title: 'Buraco', city: 'São Paulo', cityKey: 'sao paulo', state: 'SP' }) },
      ...(overrides.prisma as object),
    }

    const storage = {
      assertOwnStorageUrls: jest.fn(),
      extractKeyFromUrl: jest.fn((u: string) => u.replace('https://cdn.votz.local/', '')),
      getPublicUrl: jest.fn((k: string) => `https://cdn.votz.local/${k}`),
      ...(overrides.storage as object),
    }

    const gifs = {
      isAllowedGifUrl: jest.fn((u: string) => u.startsWith('https://static.klipy.com/')),
    }

    const topics = {
      syncPostTopics: jest.fn().mockResolvedValue([]),
    }

    const ranking = {
      enqueuePost: jest.fn().mockResolvedValue(undefined),
    }

    const notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
    }

    const mail = {}

    const service = new PostsService(
      repo as never,
      prisma as never,
      storage as never,
      gifs as never,
      topics as never,
      ranking as never,
      notifications as never,
      mail as never,
      overrides.media as never,
    )

    return { service, repo, prisma, storage, gifs }
  }

  it('rejects audio comment from non-author user', async () => {
    const { service } = makeService()
    const key = 'post-comments/11111111-1111-1111-1111-111111111111.webm'

    await expect(
      service.createComment(
        'p1',
        { id: 'other-user', type: 'CITIZEN', ctx: null },
        {
          mediaType: PostCommentMediaType.AUDIO,
          mediaKey: key,
          mediaUrl: `https://cdn.votz.local/${key}`,
          mediaDuration: 12,
        },
      ),
    ).rejects.toThrow(ForbiddenException)
  })

  it('allows audio comment only for the post author (personal or matching org context)', async () => {
    const { service, repo } = makeService()
    const key = 'post-comments/11111111-1111-1111-1111-111111111111.webm'

    await expect(
      service.createComment(
        'p1',
        { id: 'author-1', type: 'CITIZEN', ctx: null },
        {
          mediaType: PostCommentMediaType.AUDIO,
          mediaKey: key,
          mediaUrl: `https://cdn.votz.local/${key}`,
          mediaDuration: 12,
        },
      ),
    ).resolves.toEqual({ id: 'c1', postId: 'p1' })

    expect(repo.createComment).toHaveBeenCalled()
  })

  it('enforces org context matching for audio comment on institutional posts', async () => {
    const { service } = makeService({
      prisma: {
        post: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'p1',
            authorUserId: 'author-1',
            authorOrgType: OrgType.POLITICIAN,
            authorOrgId: 'pol-1',
          }),
        },
        orgMembership: {
          findUnique: jest.fn().mockResolvedValue({
            status: 'ACTIVE',
            role: { permissions: [] },
          }),
        },
      },
    })
    const key = 'post-comments/11111111-1111-1111-1111-111111111111.webm'

    // Personal context cannot comment with audio on org post
    await expect(
      service.createComment(
        'p1',
        { id: 'author-1', type: 'CITIZEN', ctx: null },
        {
          mediaType: PostCommentMediaType.AUDIO,
          mediaKey: key,
          mediaUrl: `https://cdn.votz.local/${key}`,
        },
      ),
    ).rejects.toThrow(ForbiddenException)

    // Matching org context succeeds
    await expect(
      service.createComment(
        'p1',
        {
          id: 'member-2',
          type: 'CITIZEN',
          ctx: { type: 'POLITICIAN', id: 'pol-1', name: 'Vereador', logoUrl: null, permissions: [] },
        },
        {
          mediaType: PostCommentMediaType.AUDIO,
          mediaKey: key,
          mediaUrl: `https://cdn.votz.local/${key}`,
        },
      ),
    ).resolves.toEqual({ id: 'c1', postId: 'p1' })
  })

  it('allows GIF comments from allowlisted external provider and blocks arbitrary URLs', async () => {
    const { service } = makeService()

    await expect(
      service.createComment(
        'p1',
        { id: 'u2', type: 'CITIZEN', ctx: null },
        {
          mediaType: PostCommentMediaType.GIF,
          mediaUrl: 'https://static.klipy.com/gifs/ok.gif',
        },
      ),
    ).resolves.toEqual({ id: 'c1', postId: 'p1' })

    await expect(
      service.createComment(
        'p1',
        { id: 'u2', type: 'CITIZEN', ctx: null },
        {
          mediaType: PostCommentMediaType.GIF,
          mediaUrl: 'https://evil.site/hack.gif',
        },
      ),
    ).rejects.toThrow(BadRequestException)
  })

  it('rejects empty post with no text, media, poll or mention', async () => {
    const { service } = makeService()

    await expect(
      service.create({ content: '   ' }, { id: 'u1', type: 'CITIZEN', ctx: null }),
    ).rejects.toThrow(BadRequestException)
  })

  it('returns repost distribution context while preserving the original author', async () => {
    const findFeedCandidates = jest.fn().mockResolvedValue({
      posts: [{ id: 'original' }], total: 1,
      reposts: { original: { id: 'repost', createdAt: '2026-11-17T12:00:00.000Z', user: { id: 'reposter', name: 'Bruno' } } },
    })
    const { service } = makeService({ repo: {
      findFeedCandidates,
      hydratePosts: jest.fn().mockResolvedValue([{ id: 'original', author: { userId: 'author', name: 'Ana' } }]),
    } })
    const result = await service.listFeed({ profileUserId: 'reposter', sort: 'for_you', page: 2, limit: 5 })
    expect(findFeedCandidates).toHaveBeenCalledWith(expect.objectContaining({ profileUserId: 'reposter', sort: 'recent', page: 2, limit: 5 }))
    expect(result.data[0]).toMatchObject({ id: 'original', author: { userId: 'author' }, repost: { user: { id: 'reposter' } } })
    expect(result.meta.total).toBe(1)
  })

  it('does not fabricate a reposter for ordinary authored posts', async () => {
    const { service } = makeService({ repo: {
      findFeedCandidates: jest.fn().mockResolvedValue({ posts: [{ id: 'p1' }], total: 1 }),
    } })
    expect((await service.listFeed({ sort: 'recent' })).data[0].repost).toBeNull()
  })
})

describe('PostsService.create com fotos e vídeos no padrão de formatos', () => {
  const ID = '11111111-1111-4111-8111-111111111111'
  const prepared = { items: [{ id: ID, kind: 'IMAGE', position: 0 }], media: ['https://cdn.votz.local/posts/a.feed.jpeg'], mediaKeys: ['posts/a.jpeg', 'posts/a.feed.jpeg'], renderedKeys: ['posts/a.jpeg'] }

  function build(createPost: jest.Mock) {
    const media = {
      prepareForPost: jest.fn().mockResolvedValue(prepared),
      finalizeForPost: jest.fn().mockResolvedValue(undefined),
      releaseForPost: jest.fn().mockResolvedValue(undefined),
    }
    const repo = { createPost, findRawById: jest.fn().mockResolvedValue({ id: 'p1' }), hydratePosts: jest.fn().mockResolvedValue([{ id: 'p1' }]) }
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ city: 'São Paulo', state: 'SP' }) } }
    const storage = { assertOwnStorageUrls: jest.fn(), extractKeyFromUrl: jest.fn() }
    const service = new PostsService(
      repo as never,
      prisma as never,
      storage as never,
      {} as never,
      { syncPostTopics: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      media as never,
    )
    return { service, media, repo }
  }

  it('prepara antes, grava os links e as chaves gerados e liga os arquivos à publicação criada', async () => {
    const { service, media, repo } = build(jest.fn().mockResolvedValue({ id: 'p1' }))
    await service.create({ mediaAssets: [{ id: ID, format: 'PORTRAIT' }] }, { id: 'u1', type: 'CITIZEN', ctx: null } as never)
    expect(media.prepareForPost).toHaveBeenCalledWith('u1', [{ id: ID, format: 'PORTRAIT' }])
    expect(repo.createPost.mock.calls[0][0]).toMatchObject({ media: prepared.media, mediaKeys: prepared.mediaKeys })
    expect(media.finalizeForPost).toHaveBeenCalledWith('p1', prepared)
    expect(media.releaseForPost).not.toHaveBeenCalled()
  })

  it('se a publicação não for criada, desfaz a preparação', async () => {
    const { service, media } = build(jest.fn().mockRejectedValue(new Error('db fora')))
    await expect(
      service.create({ mediaAssets: [{ id: ID, format: 'SQUARE' }] }, { id: 'u1', type: 'CITIZEN', ctx: null } as never),
    ).rejects.toThrow('db fora')
    expect(media.releaseForPost).toHaveBeenCalledWith(prepared)
    expect(media.finalizeForPost).not.toHaveBeenCalled()
  })

  it('não aceita misturar o envio antigo (media) com o novo (mediaAssets)', async () => {
    const { service } = build(jest.fn())
    await expect(
      service.create(
        { media: ['https://cdn.votz.local/posts/x.jpeg'], mediaAssets: [{ id: ID, format: 'SQUARE' }] },
        { id: 'u1', type: 'CITIZEN', ctx: null } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('PostsService.getWhoToFollow', () => {
  const viewer = { userId: 'u1', followedUserIds: new Set(['f1']), city: 'Campinas', state: 'SP' }
  const profile = (id: string, kind: 'politicians' | 'entities' = 'politicians') => ({
    kind, id, name: `Perfil ${id}`, username: null, avatarUrl: null, verified: false, subtitle: null,
  })

  function build(found: ReturnType<typeof profile>[], circle: Map<string, { names: string[]; total: number }>) {
    const repo = {
      getViewerContext: jest.fn().mockResolvedValue(viewer),
      findSuggestedProfiles: jest.fn().mockResolvedValue(found),
      findCircleFollowers: jest.fn().mockResolvedValue(circle),
    }
    const service = new PostsService(repo as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
    return { service, repo }
  }

  it('põe primeiro quem tem gente do círculo seguindo e mantém a ordem original no empate', async () => {
    const { service } = build(
      [profile('a'), profile('b'), profile('c', 'entities')],
      new Map([['entities:c', { names: ['Maria'], total: 3 }]]),
    )
    const { profiles } = await service.getWhoToFollow({ id: 'u1' } as never, 5)
    expect(profiles.map((p) => p.id)).toEqual(['c', 'a', 'b'])
    expect(profiles[0].followedBy).toEqual({ names: ['Maria'], total: 3 })
    expect(profiles[1].followedBy).toBeUndefined()
  })

  it('limita a quantidade devolvida entre 1 e 10', async () => {
    const many = Array.from({ length: 12 }, (_, i) => profile(String(i)))
    const { service } = build(many, new Map())
    expect((await service.getWhoToFollow(null, 3)).profiles).toHaveLength(3)
    expect((await service.getWhoToFollow(null, 99)).profiles).toHaveLength(10)
    expect((await service.getWhoToFollow(null, 0)).profiles).toHaveLength(1)
  })

  it('devolve lista vazia quando não há sugestão para a região', async () => {
    const { service } = build([], new Map())
    await expect(service.getWhoToFollow(null)).resolves.toEqual({ profiles: [] })
  })
})
