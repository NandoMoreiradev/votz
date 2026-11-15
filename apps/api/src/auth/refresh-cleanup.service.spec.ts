import { RefreshCleanupService } from './refresh-cleanup.service'

describe('RefreshCleanupService', () => {
  it('deletes only refresh tokens expired more than 30 days ago', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 7 })
    const prisma: any = { refreshToken: { deleteMany } }
    const queue: any = { add: jest.fn() }
    const service = new RefreshCleanupService(prisma, queue)

    const now = new Date('2026-11-15T03:00:00.000Z')
    const res = await service.purgeExpiredTokens(now)

    expect(res).toEqual({ deleted: 7 })
    const expectedCutoff = new Date(now.getTime() - 30 * 86_400_000)
    expect(deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expectedCutoff } },
    })
  })
})
