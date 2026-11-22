import { BadRequestException, HttpException } from '@nestjs/common'
import sharp from 'sharp'
import { MediaAssetsService, MAX_MEDIA_DRAFTS } from './media-assets.service'
import { itemsForPost, legacyItemsFromUrls, type MediaAssetView } from './media-items'

const USER = 'user-1'
const PUBLIC = 'https://cdn.votz.test'
const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'

type Row = Record<string, unknown> & { id: string }

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: ID1,
    uploaderId: USER,
    purpose: 'POST',
    kind: 'IMAGE',
    status: 'UPLOADED',
    sourceKey: `media-src/${overrides.id ?? ID1}.jpeg`,
    sourceMime: 'image/jpeg',
    sourceSizeBytes: 1000,
    sourceWidth: 4000,
    sourceHeight: 3000,
    durationMs: null,
    postId: null,
    key: null,
    feedKey: null,
    thumbKey: null,
    posterKey: null,
    ...overrides,
  }
}

function setup(rows: Row[] = []) {
  const prisma = {
    mediaAsset: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    post: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  }
  const storage = {
    uploadBuffer: jest.fn().mockResolvedValue(undefined),
    getObjectBuffer: jest.fn(),
    getPublicUrl: jest.fn((key: string) => `${PUBLIC}/${key}`),
    delete: jest.fn().mockResolvedValue(undefined),
    headObjectSize: jest.fn(),
    sniffObjectMime: jest.fn(),
    getSignedUploadUrl: jest.fn().mockResolvedValue('https://bucket/put'),
  }
  const config = { get: jest.fn() }
  const queue = { add: jest.fn().mockResolvedValue({}), remove: jest.fn().mockResolvedValue(1) }
  const service = new MediaAssetsService(prisma as never, storage as never, config as never, queue as never)
  return { service, prisma, storage, queue, config }
}

const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 100, g: 120, b: 140 } } }).jpeg().toBuffer()

describe('MediaAssetsService.upload', () => {
  it('foto: guarda o original PRIVADO em media-src, sem metadados, e devolve o tamanho como a pessoa vê', async () => {
    const { service, prisma, storage } = setup()
    const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const result = await service.upload(USER, original)
    expect(result).toMatchObject({ kind: 'IMAGE', width: 800, height: 1200, durationMs: null })
    const [key, , mime, isPrivate] = storage.uploadBuffer.mock.calls[0]
    expect(key).toMatch(/^media-src\/[0-9a-f-]{36}\.jpeg$/)
    expect(mime).toBe('image/jpeg')
    expect(isPrivate).toBe(true)
    expect(prisma.mediaAsset.create.mock.calls[0][0].data).toMatchObject({ uploaderId: USER, kind: 'IMAGE', status: 'UPLOADED', sourceWidth: 800, sourceHeight: 1200 })
  })

  it('GIF vai direto para a pasta pública (não é recortado)', async () => {
    const { service, storage } = setup()
    const gif = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 1, g: 1, b: 1 } } }).gif().toBuffer()
    const result = await service.upload(USER, gif)
    expect(result).toMatchObject({ kind: 'GIF', width: 300, height: 200 })
    const [key, , , isPrivate] = storage.uploadBuffer.mock.calls[0]
    expect(key).toMatch(/^posts\/.+\.gif$/)
    expect(isPrivate).toBe(false)
  })

  it('recusa tipo desconhecido e excesso de envios sem publicar', async () => {
    const { service, prisma } = setup()
    await expect(service.upload(USER, Buffer.from('%PDF-1.4 qualquer coisa aqui'))).rejects.toBeInstanceOf(BadRequestException)
    prisma.mediaAsset.count.mockResolvedValue(MAX_MEDIA_DRAFTS)
    await expect(service.upload(USER, await jpeg(400, 400))).rejects.toBeInstanceOf(HttpException)
  })

  it('se o banco falhar, apaga o arquivo que já subiu', async () => {
    const { service, prisma, storage } = setup()
    prisma.mediaAsset.create.mockRejectedValue(new Error('db fora'))
    await expect(service.upload(USER, await jpeg(400, 400))).rejects.toThrow('db fora')
    expect(storage.delete).toHaveBeenCalledWith(storage.uploadBuffer.mock.calls[0][0])
  })
})

describe('MediaAssetsService.complete (envio direto de vídeo)', () => {
  it('tamanho diferente do assinado: apaga e recusa', async () => {
    const { service, prisma, storage } = setup()
    prisma.mediaAsset.findFirst.mockResolvedValue(makeRow({ kind: 'VIDEO', status: 'UPLOADING', sourceKey: `media-src/${ID1}.mp4`, sourceSizeBytes: 5000, sourceWidth: null, sourceHeight: null }))
    storage.headObjectSize.mockResolvedValue(4000)
    await expect(service.complete(USER, ID1)).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.delete).toHaveBeenCalledWith(`media-src/${ID1}.mp4`)
    expect(prisma.mediaAsset.deleteMany).toHaveBeenCalled()
  })

  it('confirmação repetida devolve o mesmo resultado', async () => {
    const { service, prisma } = setup()
    prisma.mediaAsset.findFirst.mockResolvedValue(makeRow({ kind: 'VIDEO', status: 'UPLOADED', sourceWidth: 1080, sourceHeight: 1920, durationMs: 3000 }))
    await expect(service.complete(USER, ID1)).resolves.toEqual({ id: ID1, kind: 'VIDEO', width: 1080, height: 1920, durationMs: 3000 })
  })
})

describe('MediaAssetsService.prepareForPost', () => {
  it('recusa formatos misturados, arquivo de outra pessoa ou já usado, e recorte inválido', async () => {
    const { service, prisma } = setup([makeRow()])
    await expect(
      service.prepareForPost(USER, [
        { id: ID1, format: 'SQUARE' },
        { id: ID2, format: 'PORTRAIT' },
      ]),
    ).rejects.toThrow(/mesmo formato/)

    prisma.mediaAsset.findMany.mockResolvedValue([]) // não é da pessoa (a busca filtra por dono)
    await expect(service.prepareForPost(USER, [{ id: ID1, format: 'SQUARE' }])).rejects.toThrow(/não está disponível/)

    prisma.mediaAsset.findMany.mockResolvedValue([makeRow({ status: 'READY', postId: 'post-x' })])
    await expect(service.prepareForPost(USER, [{ id: ID1, format: 'SQUARE' }])).rejects.toThrow(/não está disponível/)

    prisma.mediaAsset.findMany.mockResolvedValue([makeRow()])
    await expect(
      service.prepareForPost(USER, [{ id: ID1, format: 'SQUARE', crop: { x: 0, y: 0, w: 1, h: 1 } }]),
    ).rejects.toThrow(/quadrado/)
    expect(prisma.mediaAsset.updateMany).not.toHaveBeenCalled()
  })

  it('foto: reserva, gera as três versões públicas e devolve o link do feed e todas as chaves', async () => {
    const { service, prisma, storage } = setup([makeRow()])
    storage.getObjectBuffer.mockResolvedValue(await jpeg(4000, 3000))
    const prepared = await service.prepareForPost(USER, [{ id: ID1, format: 'PORTRAIT' }])

    expect(prisma.mediaAsset.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: ID1, status: 'UPLOADED', postId: null },
      data: { status: 'PROCESSING', format: 'PORTRAIT' },
    })
    const keys = storage.uploadBuffer.mock.calls.map((call) => call[0])
    expect(keys).toEqual([`posts/${ID1}.jpeg`, `posts/${ID1}.feed.jpeg`, `posts/${ID1}.thumb.webp`])
    expect(storage.uploadBuffer.mock.calls.every((call) => call[3] === false)).toBe(true)
    // A linha guarda o tamanho da versão cheia (4:5 de uma foto de 3000 px de altura: 1638x2048).
    expect(prisma.mediaAsset.update.mock.calls[0][0].data).toMatchObject({ key: `posts/${ID1}.jpeg`, width: 1638, height: 2048 })
    expect(prepared.media).toEqual([`${PUBLIC}/posts/${ID1}.feed.jpeg`])
    expect(prepared.mediaKeys).toEqual(expect.arrayContaining([`media-src/${ID1}.jpeg`, ...keys]))
    expect(prepared.items).toEqual([{ id: ID1, kind: 'IMAGE', position: 0 }])
  })

  it('vídeo: só reserva (o recorte sai da fila) e já conhece a chave final', async () => {
    const { service, storage } = setup([makeRow({ kind: 'VIDEO', sourceKey: `media-src/${ID1}.mp4`, sourceWidth: 1080, sourceHeight: 1920 })])
    const prepared = await service.prepareForPost(USER, [{ id: ID1, format: 'PORTRAIT' }])
    expect(storage.uploadBuffer).not.toHaveBeenCalled()
    expect(prepared.media).toEqual([])
    expect(prepared.mediaKeys).toEqual([`media-src/${ID1}.mp4`, `posts/${ID1}.mp4`])
  })

  it('dois toques em "Publicar": o segundo pedido não pega o arquivo e libera o que reservou', async () => {
    const rows = [makeRow(), makeRow({ id: ID2, sourceKey: `media-src/${ID2}.jpeg` })]
    const { service, prisma } = setup(rows)
    prisma.mediaAsset.updateMany
      .mockResolvedValueOnce({ count: 1 }) // reservou o primeiro
      .mockResolvedValueOnce({ count: 0 }) // o segundo já estava com o outro pedido
    await expect(
      service.prepareForPost(USER, [
        { id: ID1, format: 'SQUARE' },
        { id: ID2, format: 'SQUARE' },
      ]),
    ).rejects.toThrow(/já está sendo publicado/)
    const release = prisma.mediaAsset.updateMany.mock.calls[2][0]
    expect(release.where.id.in).toEqual([ID1])
    expect(release.data.status).toBe('UPLOADED')
  })

  it('falha ao gerar a foto: apaga o que subiu, libera e responde em português', async () => {
    const { service, prisma, storage } = setup([makeRow()])
    storage.getObjectBuffer.mockResolvedValue(await jpeg(4000, 3000))
    storage.uploadBuffer.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('bucket fora'))
    await expect(service.prepareForPost(USER, [{ id: ID1, format: 'SQUARE' }])).rejects.toThrow(/Não foi possível preparar/)
    expect(storage.delete).toHaveBeenCalledWith(`posts/${ID1}.jpeg`)
    const statuses = prisma.mediaAsset.updateMany.mock.calls.map((call) => call[0].data.status).filter(Boolean)
    expect(statuses).toEqual(['PROCESSING', 'UPLOADED'])
  })
})

describe('MediaAssetsService.finalizeForPost', () => {
  it('liga à publicação: foto pronta (e o original é apagado), vídeo na fila', async () => {
    const { service, prisma, storage, queue } = setup()
    prisma.mediaAsset.findMany.mockResolvedValue([{ id: ID1, sourceKey: `media-src/${ID1}.jpeg` }])
    await service.finalizeForPost('post-1', {
      items: [
        { id: ID1, kind: 'IMAGE', position: 0 },
        { id: ID2, kind: 'VIDEO', position: 1 },
      ],
      media: [],
      mediaKeys: [],
      renderedKeys: [],
    })
    const [image, video] = prisma.mediaAsset.update.mock.calls.slice(0, 2).map((call) => call[0])
    expect(image).toMatchObject({ where: { id: ID1 }, data: { postId: 'post-1', position: 0, status: 'READY' } })
    expect(video.data.status).toBeUndefined()
    expect(queue.add).toHaveBeenCalledWith('render-video', { assetId: ID2 }, expect.objectContaining({ jobId: `render-video-${ID2}` }))
    expect(storage.delete).toHaveBeenCalledWith(`media-src/${ID1}.jpeg`)
  })
})

describe('itens para a tela', () => {
  const url = (key: string) => `${PUBLIC}/${key}`
  const asset = (overrides: Partial<MediaAssetView>): MediaAssetView => ({
    id: ID1,
    kind: 'IMAGE',
    status: 'READY',
    format: 'PORTRAIT',
    key: 'posts/a.jpeg',
    feedKey: 'posts/a.feed.jpeg',
    thumbKey: 'posts/a.thumb.webp',
    posterKey: null,
    width: 1638,
    height: 2048,
    sourceWidth: null,
    sourceHeight: null,
    durationMs: null,
    legacy: false,
    ...overrides,
  })

  it('foto pronta: moldura do formato, preenchendo (cover), feed + cheia + miniatura', () => {
    const [item] = itemsForPost([asset({})], [], url)
    expect(item).toMatchObject({ format: 'PORTRAIT', fit: 'cover', url: url('posts/a.feed.jpeg'), fullUrl: url('posts/a.jpeg'), thumbUrl: url('posts/a.thumb.webp'), status: 'READY' })
  })

  it('vídeo processando: moldura certa, sem link do original', () => {
    const [item] = itemsForPost([asset({ kind: 'VIDEO', status: 'PROCESSING', key: null, feedKey: null, thumbKey: null })], [], url)
    expect(item).toMatchObject({ status: 'PROCESSING', url: null, width: 1080, height: 1350, format: 'PORTRAIT' })
  })

  it('falha não aparece; GIF e antigos aparecem inteiros (contain) na moldura mais próxima', () => {
    expect(itemsForPost([asset({ status: 'FAILED' })], [], url)).toEqual([])
    const [gif] = itemsForPost([asset({ kind: 'GIF', format: null, key: 'posts/g.gif', feedKey: null, width: 480, height: 270 })], [], url)
    expect(gif).toMatchObject({ fit: 'contain', format: 'LANDSCAPE', url: url('posts/g.gif') })
    const [legacy] = itemsForPost([asset({ legacy: true, format: null, feedKey: null, width: 1000, height: 1000 })], [], url)
    expect(legacy).toMatchObject({ fit: 'contain', format: 'SQUARE' })
  })

  it('publicação sem registro usa os links antigos (vídeo com capa por convenção)', () => {
    const items = legacyItemsFromUrls([`${PUBLIC}/posts/a.jpeg`, `${PUBLIC}/posts/b.mp4`])
    expect(items.map((item) => item.kind)).toEqual(['IMAGE', 'VIDEO'])
    expect(items[1].posterUrl).toBe(`${PUBLIC}/posts/b.poster.jpg`)
    expect(items.every((item) => item.fit === 'contain' && item.format === null)).toBe(true)
  })
})
