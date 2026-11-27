import { PostsRepository } from './posts.repository'

describe('PostsRepository.findCircleFollowers', () => {
  const viewer = { userId: 'u1', followedUserIds: new Set(['f1', 'f2', 'f3']) }
  const politician = { kind: 'politicians' as const, id: 'p1', name: 'P', username: null, avatarUrl: null, verified: false, subtitle: null }
  const entity = { ...politician, kind: 'entities' as const, id: 'e1' }

  function build(politicianRows: unknown[], entityRows: unknown[]) {
    const prisma = {
      userPoliticianFollower: { findMany: jest.fn().mockResolvedValue(politicianRows) },
      userEntityFollower: { findMany: jest.fn().mockResolvedValue(entityRows) },
    }
    return { repo: new PostsRepository(prisma as never), prisma }
  }

  it('conta quem do círculo segue e guarda só os 2 primeiros nomes', async () => {
    const { repo } = build(
      [
        { politicianId: 'p1', user: { name: 'Maria' } },
        { politicianId: 'p1', user: { name: 'João' } },
        { politicianId: 'p1', user: { name: 'Ana' } },
      ],
      [{ entityId: 'e1', user: { name: 'Pedro' } }],
    )
    const result = await repo.findCircleFollowers([politician, entity], viewer as never)
    expect(result.get('politicians:p1')).toEqual({ names: ['Maria', 'João'], total: 3 })
    expect(result.get('entities:e1')).toEqual({ names: ['Pedro'], total: 1 })
  })

  it('só olha o círculo da pessoa e esconde quem deixou a atividade pública oculta', async () => {
    const { repo, prisma } = build([], [])
    await repo.findCircleFollowers([politician], viewer as never)
    const where = prisma.userPoliticianFollower.findMany.mock.calls[0][0].where
    expect(where.userId).toEqual({ in: ['f1', 'f2', 'f3'] })
    expect(where.user.banned).toBe(false)
    expect(where.user.OR).toEqual([
      { notificationPreference: { is: null } },
      { notificationPreference: { is: { publicActivityVisible: true } } },
    ])
    expect(prisma.userEntityFollower.findMany).not.toHaveBeenCalled()
  })

  it('não consulta nada quando a pessoa não segue ninguém', async () => {
    const { repo, prisma } = build([], [])
    const result = await repo.findCircleFollowers([politician], { userId: 'u1', followedUserIds: new Set() } as never)
    expect(result.size).toBe(0)
    expect(prisma.userPoliticianFollower.findMany).not.toHaveBeenCalled()
  })
})
