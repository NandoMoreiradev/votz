import sharp from 'sharp'
import { LegacyMediaBackfill } from './legacy-backfill'

const BASE = 'https://cdn.votz.test'
const post = (id: string, media: string[]) => ({ id, media, authorUserId: 'u1', createdAt: new Date('2026-11-01T10:00:00Z') })

function setup(objects: Record<string, Buffer>, pages: ReturnType<typeof post>[][] = []) {
  const prisma = {
    post: { findMany: jest.fn() },
    mediaAsset: { count: jest.fn().mockResolvedValue(0), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  }
  for (const page of pages) prisma.post.findMany.mockResolvedValueOnce(page)
  prisma.post.findMany.mockResolvedValue([])
  const storage = {
    extractKeyFromUrl: (url: string) => (url.startsWith(`${BASE}/`) ? url.slice(BASE.length + 1) : null),
    getObjectBuffer: jest.fn(async (key: string) => objects[key] ?? null),
    headObjectSize: jest.fn(async (key: string) => (objects[key] ? objects[key].byteLength : null)),
  }
  return { backfill: new LegacyMediaBackfill(prisma as never, storage as never), prisma, storage }
}

const jpeg = (width: number, height: number, orientation?: number) => {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 9, g: 9, b: 9 } } }).jpeg()
  return (orientation ? image.withMetadata({ orientation }) : image).toBuffer()
}

describe('LegacyMediaBackfill', () => {
  it('registra tamanho e moldura mais próxima, sem recortar (legacy = contain), com miniatura quando existe', async () => {
    const { backfill, prisma } = setup({
      'posts/a.jpeg': await jpeg(3024, 4032),
      'posts/a.thumb.webp': Buffer.from('x'),
      'posts/b.jpeg': await jpeg(1600, 900),
    })
    const count = await backfill.migratePost(post('p1', [`${BASE}/posts/a.jpeg`, `${BASE}/posts/b.jpeg`]))
    expect(count).toBe(2)
    const rows = prisma.mediaAsset.createMany.mock.calls[0][0].data
    expect(rows[0]).toMatchObject({ key: 'posts/a.jpeg', format: 'PORTRAIT', legacy: true, status: 'READY', width: 3024, height: 4032, thumbKey: 'posts/a.thumb.webp', postId: 'p1', position: 0 })
    expect(rows[1]).toMatchObject({ key: 'posts/b.jpeg', format: 'LANDSCAPE', thumbKey: null, position: 1 })
  })

  it('foto antiga com rotação só marcada (EXIF 6) tem largura e altura trocadas', async () => {
    const { backfill, prisma } = setup({ 'posts/r.jpeg': await jpeg(4000, 3000, 6) })
    await backfill.migratePost(post('p1', [`${BASE}/posts/r.jpeg`]))
    expect(prisma.mediaAsset.createMany.mock.calls[0][0].data[0]).toMatchObject({ width: 3000, height: 4000, format: 'PORTRAIT' })
  })

  it('pula link de fora, arquivo que não abre e arquivo já registrado; dry-run não grava', async () => {
    const { backfill, prisma } = setup({ 'posts/ok.jpeg': await jpeg(500, 500) })
    expect(await backfill.migratePost(post('p1', ['https://outro.site/x.jpeg']))).toBeNull()
    expect(await backfill.migratePost(post('p2', [`${BASE}/posts/sumiu.jpeg`]))).toBeNull()
    prisma.mediaAsset.count.mockResolvedValueOnce(1)
    expect(await backfill.migratePost(post('p3', [`${BASE}/posts/ok.jpeg`]))).toBeNull()
    expect(await backfill.migratePost(post('p4', [`${BASE}/posts/ok.jpeg`]), true)).toBe(1)
    expect(prisma.mediaAsset.createMany).not.toHaveBeenCalled()
  })

  it('percorre as páginas sem repetir as publicações puladas', async () => {
    const { backfill, prisma } = setup(
      { 'posts/ok.jpeg': await jpeg(500, 500) },
      [[post('a', ['https://fora/x.jpeg']), post('b', [`${BASE}/posts/ok.jpeg`])]],
    )
    const summary = await backfill.run({ batch: 2 })
    expect(summary).toEqual({ posts: 2, migrated: 1, skipped: 1, items: 1 })
    expect(prisma.post.findMany.mock.calls[1][0].where.id).toEqual({ gt: 'b' })
  })
})
