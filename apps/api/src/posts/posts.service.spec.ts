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
})
