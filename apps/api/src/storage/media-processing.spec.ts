import { MediaProcessingProcessor, MediaProcessingService, NORMALIZE_VIDEO_JOB } from './media-processing'
import { normalizeVideo } from './video-normalize'
import { generateVideoPoster } from './video-poster'

jest.mock('./video-normalize', () => ({ normalizeVideo: jest.fn() }))
jest.mock('./video-poster', () => ({ ...jest.requireActual('./video-poster'), generateVideoPoster: jest.fn() }))

const normalize = normalizeVideo as jest.Mock
const KEY = 'reports/abc.mov'
const original = Buffer.alloc(5000, 1)
const converted = Buffer.alloc(900, 2)

function setup(row: { id: string; processing: string; sizeBytes: number } | null = { id: 'm1', processing: 'PENDING', sizeBytes: 5000 }) {
  const prisma = {
    reportMedia: {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  }
  const storage = {
    getObjectBuffer: jest.fn().mockResolvedValue(original),
    uploadBuffer: jest.fn().mockResolvedValue(undefined),
  }
  const processor = new MediaProcessingProcessor(prisma as never, storage as never)
  const run = (key = KEY) => processor.process({ data: { key } } as never)
  return { processor, prisma, storage, run }
}

describe('MediaProcessingProcessor', () => {
  beforeEach(() => normalize.mockReset())

  it('troca o original pelo vídeo convertido, na mesma chave, e atualiza o controle', async () => {
    const { prisma, storage, run } = setup()
    normalize.mockResolvedValue({ status: 'DONE', data: converted, width: 1080, height: 1920, durationMs: 4200 })

    await expect(run()).resolves.toEqual({ status: 'DONE', before: 5000, after: 900 })
    expect(normalize).toHaveBeenCalledWith(original, 'mov')
    expect(storage.uploadBuffer).toHaveBeenCalledWith(KEY, converted, 'video/mp4', false)
    expect(prisma.reportMedia.update).toHaveBeenCalledWith({
      where: { key: KEY },
      data: { processing: 'DONE', mimeType: 'video/mp4', sizeBytes: 900, width: 1080, height: 1920, durationMs: 4200 },
    })
  })

  it('vídeo que já está bom não é regravado', async () => {
    const { prisma, storage, run } = setup()
    normalize.mockResolvedValue({ status: 'SKIPPED', reason: 'já está bom', width: 1280, height: 720, durationMs: 3000 })

    await expect(run()).resolves.toMatchObject({ status: 'SKIPPED' })
    expect(storage.uploadBuffer).not.toHaveBeenCalled()
    expect(prisma.reportMedia.update).toHaveBeenCalledWith({
      where: { key: KEY },
      data: { processing: 'SKIPPED', width: 1280, height: 720, durationMs: 3000 },
    })
  })

  it('se o ffmpeg falhar, fica o original, o controle diz FAILED e o trabalho não é repetido à toa', async () => {
    const { prisma, storage, run } = setup()
    normalize.mockResolvedValue({ status: 'FAILED', reason: 'arquivo estragado' })

    await expect(run()).resolves.toMatchObject({ status: 'FAILED', reason: 'arquivo estragado' })
    expect(storage.uploadBuffer).not.toHaveBeenCalled()
    expect(prisma.reportMedia.update).toHaveBeenCalledWith({ where: { key: KEY }, data: { processing: 'FAILED' } })
  })

  it('arquivo que sumiu do bucket vira FAILED sem tentar converter', async () => {
    const { prisma, storage, run } = setup()
    storage.getObjectBuffer.mockResolvedValue(null)

    await expect(run()).resolves.toMatchObject({ status: 'FAILED' })
    expect(normalize).not.toHaveBeenCalled()
    expect(prisma.reportMedia.update).toHaveBeenCalledWith({ where: { key: KEY }, data: { processing: 'FAILED' } })
  })

  it('não converte duas vezes: se o controle já não está PENDING, nem baixa o arquivo', async () => {
    for (const processing of ['DONE', 'SKIPPED', 'FAILED']) {
      const { storage, run } = setup({ id: 'm1', processing, sizeBytes: 1 })
      await expect(run()).resolves.toEqual({ status: 'JA_PROCESSADO' })
      expect(storage.getObjectBuffer).not.toHaveBeenCalled()
    }
    expect(normalize).not.toHaveBeenCalled()
  })

  it('vídeo de publicação (sem linha de controle) também é convertido', async () => {
    const { prisma, storage, run } = setup(null)
    normalize.mockResolvedValue({ status: 'DONE', data: converted, width: 1920, height: 1080, durationMs: 1000 })

    await expect(run('posts/p.mp4')).resolves.toMatchObject({ status: 'DONE' })
    expect(storage.uploadBuffer).toHaveBeenCalledWith('posts/p.mp4', converted, 'video/mp4', false)
    expect(prisma.reportMedia.update).not.toHaveBeenCalled()
  })

  it('erro de infraestrutura (bucket fora do ar) sobe para a fila tentar de novo', async () => {
    const { storage, run } = setup()
    storage.getObjectBuffer.mockRejectedValue(new Error('R2 fora do ar'))
    await expect(run()).rejects.toThrow('R2 fora do ar')
  })

  it('só desiste e marca FAILED quando as tentativas acabam', async () => {
    const { processor, prisma } = setup()
    const job = (attemptsMade: number) => ({ data: { key: KEY }, attemptsMade, opts: { attempts: 3 } }) as never

    await processor.onFailed(job(1), new Error('x'))
    await processor.onFailed(job(2), new Error('x'))
    expect(prisma.reportMedia.updateMany).not.toHaveBeenCalled()

    await processor.onFailed(job(3), new Error('R2 fora do ar'))
    expect(prisma.reportMedia.updateMany).toHaveBeenCalledWith({
      where: { key: KEY, processing: 'PENDING' },
      data: { processing: 'FAILED' },
    })
    await expect(processor.onFailed(undefined, new Error('x'))).resolves.toBeUndefined()
  })
})

describe('MediaProcessingService', () => {
  it('enfileira a conversão do vídeo', async () => {
    const queue = { add: jest.fn().mockResolvedValue({}) }
    const service = new MediaProcessingService(queue as never)
    await expect(service.enqueueVideo(KEY)).resolves.toBe(true)
    expect(queue.add).toHaveBeenCalledWith(NORMALIZE_VIDEO_JOB, { key: KEY })
  })

  it('fila fora do ar não derruba o envio do vídeo: devolve false', async () => {
    const queue = { add: jest.fn().mockRejectedValue(new Error('Redis fora do ar')) }
    const service = new MediaProcessingService(queue as never)
    await expect(service.enqueueVideo(KEY)).resolves.toBe(false)
  })
})

describe('MediaProcessingProcessor: capa do vídeo (envio direto)', () => {
  const poster = generateVideoPoster as jest.Mock
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9])
  beforeEach(() => {
    normalize.mockReset()
    poster.mockReset()
    poster.mockResolvedValue(image)
  })
  const runWithPoster = (ctx: ReturnType<typeof setup>, key = KEY) =>
    ctx.processor.process({ data: { key, poster: true } } as never)

  it('depois de converter, tira a capa do vídeo já convertido e guarda ao lado dele', async () => {
    const ctx = setup()
    normalize.mockResolvedValue({ status: 'DONE', data: converted, width: 1920, height: 1080, durationMs: 1 })
    await runWithPoster(ctx)
    expect(poster).toHaveBeenCalledWith(converted, 'mp4', expect.any(Object))
    expect(ctx.storage.uploadBuffer).toHaveBeenCalledWith('reports/abc.poster.jpg', image, 'image/jpeg', false)
  })

  it('se o vídeo já estava bom ou a conversão falhou, a capa sai do original', async () => {
    for (const status of ['SKIPPED', 'FAILED'] as const) {
      const ctx = setup()
      poster.mockClear()
      normalize.mockResolvedValue({ status, reason: 'x' })
      await runWithPoster(ctx)
      expect(poster).toHaveBeenCalledWith(original, 'mov', expect.any(Object))
      expect(ctx.storage.uploadBuffer).toHaveBeenCalledWith('reports/abc.poster.jpg', image, 'image/jpeg', false)
    }
  })

  it('sem o pedido de capa (envio pela API, que já fez a capa) não gera outra', async () => {
    const ctx = setup()
    normalize.mockResolvedValue({ status: 'DONE', data: converted, width: 1, height: 1, durationMs: 1 })
    await ctx.run()
    expect(poster).not.toHaveBeenCalled()
  })

  it('falha ao gerar ou salvar a capa não estraga a conversão', async () => {
    const ctx = setup()
    normalize.mockResolvedValue({ status: 'DONE', data: converted, width: 1, height: 1, durationMs: 1 })
    poster.mockRejectedValue(new Error('ffmpeg quebrou'))
    await expect(runWithPoster(ctx)).resolves.toMatchObject({ status: 'DONE' })

    poster.mockResolvedValue(image)
    ctx.storage.uploadBuffer.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('R2 fora do ar'))
    ctx.prisma.reportMedia.findUnique.mockResolvedValue({ id: 'm1', processing: 'PENDING', sizeBytes: 1 })
    await expect(runWithPoster(ctx)).resolves.toMatchObject({ status: 'DONE' })
  })

  it('o pedido de capa vai junto na fila só quando solicitado', async () => {
    const queue = { add: jest.fn().mockResolvedValue({}) }
    const service = new MediaProcessingService(queue as never)
    await service.enqueueVideo(KEY, { poster: true })
    await service.enqueueVideo(KEY)
    expect(queue.add.mock.calls).toEqual([
      [NORMALIZE_VIDEO_JOB, { key: KEY, poster: true }],
      [NORMALIZE_VIDEO_JOB, { key: KEY }],
    ])
  })
})
