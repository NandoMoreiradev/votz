import { BadRequestException, HttpException } from '@nestjs/common'
import sharp from 'sharp'
import { MediaAssetsService, MAX_MEDIA_DRAFTS } from './media-assets.service'
import { itemsForPost, legacyItemsFromUrls, type MediaAssetView } from './media-items'
import { probeVideoBuffer } from './media-video'

// Ler vídeo exige o ffmpeg: nos testes só a leitura (probe) é trocada; o resto do módulo é o de verdade.
jest.mock('./media-video', () => ({ ...jest.requireActual('./media-video'), probeVideoBuffer: jest.fn() }))

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

describe('MediaAssetsService: criativo de anúncio (AD_CREATIVE)', () => {
  const AD = (overrides: Partial<Row> = {}) => makeRow({ purpose: 'AD_CREATIVE', sourceWidth: 4000, sourceHeight: 3000, ...overrides })

  describe('envio', () => {
    it('GIF não vale em anúncio e nada é guardado', async () => {
      const { service, storage, prisma } = setup()
      const gif = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 1, g: 1, b: 1 } } }).gif().toBuffer()
      await expect(service.upload(USER, gif, 'AD_CREATIVE')).rejects.toThrow(/GIF/)
      expect(storage.uploadBuffer).not.toHaveBeenCalled()
      expect(prisma.mediaAsset.create).not.toHaveBeenCalled()
    })

    it('foto estreita (menos de 1080 px) é recusada antes de guardar; no envio de publicação a mesma foto passa', async () => {
      const { service, storage } = setup()
      await expect(service.upload(USER, await jpeg(800, 600), 'AD_CREATIVE')).rejects.toThrow(/pequena demais para anúncio.*1080/)
      expect(storage.uploadBuffer).not.toHaveBeenCalled()
      await expect(service.upload(USER, await jpeg(800, 600))).resolves.toMatchObject({ kind: 'IMAGE' })
    })

    it('foto de 1080 px ou mais é aceita e fica marcada como de anúncio', async () => {
      const { service, prisma } = setup()
      await expect(service.upload(USER, await jpeg(1200, 900), 'AD_CREATIVE')).resolves.toMatchObject({ kind: 'IMAGE', width: 1200 })
      expect(prisma.mediaAsset.create.mock.calls[0][0].data).toMatchObject({ purpose: 'AD_CREATIVE', uploaderId: USER })
    })

    it('envio comum continua sendo de publicação', async () => {
      const { service, prisma } = setup()
      await service.upload(USER, await jpeg(400, 400))
      expect(prisma.mediaAsset.create.mock.calls[0][0].data).toMatchObject({ purpose: 'POST' })
    })

    it('envio direto: o pedido já guarda o propósito de anúncio', async () => {
      const { service, prisma } = setup()
      await service.presign(USER, { mimeType: 'video/mp4', sizeBytes: 1000 }, 'AD_CREATIVE')
      expect(prisma.mediaAsset.create.mock.calls[0][0].data).toMatchObject({ purpose: 'AD_CREATIVE', kind: 'VIDEO', status: 'UPLOADING' })
    })

    it('envio direto: vídeo de anúncio com mais de 60 s ou estreito é apagado e recusado ao confirmar', async () => {
      for (const probe of [{ width: 1080, height: 1920, durationMs: 61_000 }, { width: 720, height: 1280, durationMs: 20_000 }]) {
        const { service, prisma, storage } = setup()
        prisma.mediaAsset.findFirst.mockResolvedValue(AD({ kind: 'VIDEO', status: 'UPLOADING', sourceKey: `media-src/${ID1}.mp4`, sourceSizeBytes: 5000, sourceWidth: null, sourceHeight: null }))
        storage.headObjectSize.mockResolvedValue(5000)
        storage.sniffObjectMime.mockResolvedValue('video/mp4')
        storage.getObjectBuffer.mockResolvedValue(Buffer.from('video'))
        ;(probeVideoBuffer as jest.Mock).mockResolvedValue(probe)
        await expect(service.complete(USER, ID1)).rejects.toBeInstanceOf(BadRequestException)
        expect(storage.delete).toHaveBeenCalledWith(`media-src/${ID1}.mp4`)
        expect(prisma.mediaAsset.update).not.toHaveBeenCalled()
      }
    })

    it('envio direto: vídeo de anúncio de 60 s com 1080 px de largura é aceito', async () => {
      const { service, prisma, storage } = setup()
      prisma.mediaAsset.findFirst.mockResolvedValue(AD({ kind: 'VIDEO', status: 'UPLOADING', sourceKey: `media-src/${ID1}.mp4`, sourceSizeBytes: 5000, sourceWidth: null, sourceHeight: null }))
      storage.headObjectSize.mockResolvedValue(5000)
      storage.sniffObjectMime.mockResolvedValue('video/mp4')
      storage.getObjectBuffer.mockResolvedValue(Buffer.from('video'))
      ;(probeVideoBuffer as jest.Mock).mockResolvedValue({ width: 1080, height: 1920, durationMs: 60_000 })
      await expect(service.complete(USER, ID1)).resolves.toMatchObject({ kind: 'VIDEO', width: 1080, durationMs: 60_000 })
    })

    it('envio direto de PUBLICAÇÃO não ganha as exigências de anúncio (vídeo estreito e longo passa)', async () => {
      const { service, prisma, storage } = setup()
      prisma.mediaAsset.findFirst.mockResolvedValue(makeRow({ kind: 'VIDEO', status: 'UPLOADING', sourceKey: `media-src/${ID1}.mp4`, sourceSizeBytes: 5000, sourceWidth: null, sourceHeight: null }))
      storage.headObjectSize.mockResolvedValue(5000)
      storage.sniffObjectMime.mockResolvedValue('video/mp4')
      storage.getObjectBuffer.mockResolvedValue(Buffer.from('video'))
      ;(probeVideoBuffer as jest.Mock).mockResolvedValue({ width: 720, height: 1280, durationMs: 90_000 })
      await expect(service.complete(USER, ID1)).resolves.toMatchObject({ kind: 'VIDEO', width: 720 })
    })
  })

  describe('prepareForAdCreative', () => {
    it('só aceita arquivo enviado como anúncio: o de publicação (ou de outra pessoa) é recusado', async () => {
      const { service, prisma } = setup([makeRow()])
      await expect(service.prepareForAdCreative(USER, [{ id: ID1, format: 'SQUARE' }])).rejects.toThrow(/não está disponível/)
      prisma.mediaAsset.findMany.mockResolvedValue([])
      await expect(service.prepareForAdCreative(USER, [{ id: ID1, format: 'SQUARE' }])).rejects.toThrow(/não está disponível/)
      expect(prisma.mediaAsset.updateMany).not.toHaveBeenCalled()
    })

    it('e a publicação não pode usar arquivo de anúncio', async () => {
      const { service } = setup([AD()])
      await expect(service.prepareForPost(USER, [{ id: ID1, format: 'SQUARE' }])).rejects.toThrow(/não está disponível/)
    })

    it('arquivo já ligado a outro criativo não pode ser usado de novo', async () => {
      const { service } = setup([AD({ adCreativeId: 'cr-outro', status: 'READY' })])
      await expect(service.prepareForAdCreative(USER, [{ id: ID1, format: 'SQUARE' }])).rejects.toThrow(/não está disponível/)
    })

    it('arquivo estreito: o que vale é a largura da parte mostrada depois do recorte', async () => {
      // 1200×800 passa no envio (1200 ≥ 1080), mas o quadrado mostra só 800 px de largura.
      const { service, prisma, storage } = setup([AD({ sourceWidth: 1200, sourceHeight: 800 })])
      await expect(service.prepareForAdCreative(USER, [{ id: ID1, format: 'SQUARE' }])).rejects.toThrow(/enquadramento.*1080/)
      expect(prisma.mediaAsset.updateMany).not.toHaveBeenCalled()
      // Em paisagem a mesma foto mostra os 1200 px inteiros.
      storage.getObjectBuffer.mockResolvedValue(await jpeg(1200, 800))
      await expect(service.prepareForAdCreative(USER, [{ id: ID1, format: 'LANDSCAPE' }])).resolves.toMatchObject({ items: [{ id: ID1 }] })
    })

    it('zoom que deixa a parte mostrada abaixo de 1080 px é recusado', async () => {
      const { service } = setup([AD({ sourceWidth: 4000, sourceHeight: 4000 })])
      // Recorte de 25% de uma foto de 4000 px = 1000 px.
      await expect(service.prepareForAdCreative(USER, [{ id: ID1, format: 'SQUARE', crop: { x: 0, y: 0, w: 0.25, h: 0.25 } }])).rejects.toThrow(/1080/)
    })

    it('vídeo de anúncio com mais de 60 s (arquivo que já estava no banco) é recusado', async () => {
      const { service } = setup([AD({ kind: 'VIDEO', sourceWidth: 1080, sourceHeight: 1920, durationMs: 75_000, sourceKey: `media-src/${ID1}.mp4` })])
      await expect(service.prepareForAdCreative(USER, [{ id: ID1, format: 'PORTRAIT' }])).rejects.toThrow(/60 segundos/)
    })

    it('foto boa: reserva, gera as versões e devolve as chaves para apagar se a campanha não for criada', async () => {
      const { service, prisma, storage } = setup([AD()])
      storage.getObjectBuffer.mockResolvedValue(await jpeg(4000, 3000))
      const prepared = await service.prepareForAdCreative(USER, [{ id: ID1, format: 'SQUARE' }])
      expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSING', format: 'SQUARE' }) }))
      expect(prepared.items).toEqual([{ id: ID1, kind: 'IMAGE', position: 0 }])
      expect(prepared.renderedKeys.length).toBe(3)
      await service.releaseForPost(prepared)
      expect(storage.delete).toHaveBeenCalledTimes(3)
    })
  })

  describe('ligar ao criativo', () => {
    const photo = { items: [{ id: ID1, kind: 'IMAGE' as const, position: 0 }], media: [], mediaKeys: [], renderedKeys: [] }
    const video = { items: [{ id: ID1, kind: 'VIDEO' as const, position: 0 }], media: [], mediaKeys: [], renderedKeys: [] }

    it('foto fica pronta na hora, ligada ao criativo (e nunca a uma publicação), dentro da transação do chamador', async () => {
      const { service, prisma } = setup()
      const tx = { mediaAsset: { update: jest.fn().mockResolvedValue({}) } }
      await service.attachToAdCreative(tx as never, 'cr-1', photo)
      expect(tx.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: ID1 },
        data: expect.objectContaining({ adCreativeId: 'cr-1', position: 0, status: 'READY' }),
      })
      expect(tx.mediaAsset.update.mock.calls[0][0].data).not.toHaveProperty('postId')
      expect(prisma.mediaAsset.update).not.toHaveBeenCalled()
    })

    it('vídeo continua "processando" até a fila terminar; depois de ligar, entra na fila', async () => {
      const { service, queue } = setup()
      const tx = { mediaAsset: { update: jest.fn().mockResolvedValue({}) } }
      await service.attachToAdCreative(tx as never, 'cr-1', video)
      expect(tx.mediaAsset.update.mock.calls[0][0].data).not.toHaveProperty('status')
      await service.afterAttach(video)
      expect(queue.add).toHaveBeenCalledWith('render-video', { assetId: ID1 }, expect.objectContaining({ jobId: `render-video-${ID1}` }))
    })

    it('foto: depois de ligar, apaga o original (não pagamos duas vezes)', async () => {
      const { service, prisma, storage } = setup()
      prisma.mediaAsset.findMany.mockResolvedValue([{ id: ID1, sourceKey: `media-src/${ID1}.jpeg` }])
      await service.afterAttach(photo)
      expect(storage.delete).toHaveBeenCalledWith(`media-src/${ID1}.jpeg`)
    })

    it('falha no pós-processamento não derruba quem chamou (a campanha já foi criada)', async () => {
      const { service, prisma } = setup()
      prisma.mediaAsset.findMany.mockRejectedValue(new Error('db fora'))
      await expect(service.afterAttach(photo)).resolves.toBeUndefined()
    })
  })

  describe('limpeza não apaga mídia de anúncio', () => {
    it('rascunhos: só entram na limpeza os arquivos sem publicação E sem criativo', async () => {
      const { service, prisma } = setup([])
      await service.purgeDrafts()
      expect(prisma.mediaAsset.findMany.mock.calls[0][0].where).toMatchObject({ postId: null, adCreativeId: null })
    })

    it('vídeo parado de anúncio também volta para a fila', async () => {
      const { service, prisma } = setup([])
      await service.requeueStuckVideos()
      expect(prisma.mediaAsset.findMany.mock.calls[0][0].where.OR).toEqual([{ postId: { not: null } }, { adCreativeId: { not: null } }])
    })

    it('apagar o rascunho (pela pessoa) nunca apaga arquivo já ligado a anúncio', async () => {
      const { service, prisma } = setup()
      prisma.mediaAsset.findFirst.mockResolvedValue(null)
      await expect(service.discard(USER, ID1)).rejects.toThrow(/não encontrado/)
      expect(prisma.mediaAsset.findFirst.mock.calls[0][0].where).toMatchObject({ postId: null, adCreativeId: null })
    })
  })
})
