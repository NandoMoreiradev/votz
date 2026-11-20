import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common'
import {
  DirectUploadService,
  MAX_OUTSTANDING_UPLOADS,
  PRESIGN_TTL_SECONDS,
  STALE_UPLOAD_HOURS,
  pendingKeyFor,
} from './direct-upload.service'

const BASE = 'https://cdn.votz.app'
const MB = 1024 * 1024
const UUID = '11111111-1111-4111-8111-111111111111'

type Row = {
  key: string
  uploaderId: string
  kind: string
  mimeType: string
  sizeBytes: number
  originalSizeBytes: number
  processing: string
  createdAt: Date
}

function setup(env: Record<string, string> = {}) {
  const rows: Row[] = []
  const prisma = {
    reportMedia: {
      count: jest.fn(async ({ where }) =>
        rows.filter((row) => row.uploaderId === where.uploaderId && row.processing === where.processing).length,
      ),
      create: jest.fn(async ({ data }) => {
        rows.push({ createdAt: new Date(), ...data })
        return data
      }),
      findUnique: jest.fn(async ({ where }) => rows.find((row) => row.key === where.key) ?? null),
      update: jest.fn(async ({ where, data }) => Object.assign(rows.find((row) => row.key === where.key)!, data)),
      delete: jest.fn(async ({ where }) => {
        const index = rows.findIndex((row) => row.key === where.key)
        if (index < 0) throw new Error('não existe')
        rows.splice(index, 1)
      }),
      findMany: jest.fn(async ({ where, take }) =>
        rows
          .filter((row) => row.processing === where.processing && row.createdAt < where.createdAt.lt)
          .slice(0, take),
      ),
    },
  }
  const storage = {
    getSignedUploadUrl: jest.fn().mockResolvedValue('https://bucket.example/pending/x?assinado=1'),
    getPublicUrl: jest.fn((key: string) => `${BASE}/${key}`),
    headObjectSize: jest.fn().mockResolvedValue(5 * MB),
    sniffObjectMime: jest.fn().mockResolvedValue('video/mp4'),
    moveObject: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  }
  const processing = { enqueueVideo: jest.fn().mockResolvedValue(true) }
  const config = { get: jest.fn((key: string) => env[key]) }
  const service = new DirectUploadService(prisma as never, storage as never, processing as never, config as never)
  return { service, prisma, storage, processing, rows }
}

describe('DirectUploadService.presign', () => {
  it('reserva a chave definitiva, assina o envio para pending/ com tipo e tamanho e devolve o necessário', async () => {
    const { service, storage, rows } = setup()
    const out = await service.presign('u1', { mimeType: 'video/quicktime', sizeBytes: 40 * MB })

    expect(out.key).toMatch(/^reports\/[0-9a-f-]{36}\.mov$/)
    expect(out.url).toBe(`${BASE}/${out.key}`)
    expect(out).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'video/quicktime' }, expiresInSeconds: PRESIGN_TTL_SECONDS })
    expect(out.uploadUrl).toContain('assinado=1')
    // O arquivo vai para a quarentena, nunca direto para a chave pública.
    expect(storage.getSignedUploadUrl).toHaveBeenCalledWith(pendingKeyFor(out.key), 'video/quicktime', PRESIGN_TTL_SECONDS, 40 * MB)
    expect(pendingKeyFor(out.key)).toMatch(/^pending\//)
    expect(rows[0]).toMatchObject({ key: out.key, uploaderId: 'u1', kind: 'VIDEO', processing: 'UPLOADING', sizeBytes: 40 * MB })
  })

  it('PDF e MP4 recebem a extensão certa', async () => {
    const { service } = setup()
    expect((await service.presign('u1', { mimeType: 'application/pdf', sizeBytes: MB })).key).toMatch(/\.pdf$/)
    expect((await service.presign('u1', { mimeType: 'video/mp4', sizeBytes: MB })).key).toMatch(/\.mp4$/)
  })

  it('recusa tipo fora da lista e arquivo acima do limite de cada tipo', async () => {
    const { service, rows } = setup()
    await expect(service.presign('u1', { mimeType: 'image/jpeg', sizeBytes: MB })).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.presign('u1', { mimeType: 'text/html', sizeBytes: 10 })).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.presign('u1', { mimeType: 'video/mp4', sizeBytes: 101 * MB })).rejects.toThrow('100 MB')
    await expect(service.presign('u1', { mimeType: 'application/pdf', sizeBytes: 51 * MB })).rejects.toThrow('50 MB')
    expect(rows).toHaveLength(0)
  })

  it('limita os envios em andamento por pessoa (429), sem afetar as outras', async () => {
    const { service } = setup()
    for (let i = 0; i < MAX_OUTSTANDING_UPLOADS; i++) await service.presign('u1', { mimeType: 'video/mp4', sizeBytes: MB })
    const refused = await service.presign('u1', { mimeType: 'video/mp4', sizeBytes: MB }).catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(HttpException)
    expect((refused as HttpException).getStatus()).toBe(429)
    await expect(service.presign('u2', { mimeType: 'video/mp4', sizeBytes: MB })).resolves.toBeDefined()
  })

  it('DIRECT_UPLOAD_ENABLED=false desliga o recurso (os apps voltam para o envio pela API)', async () => {
    const { service } = setup({ DIRECT_UPLOAD_ENABLED: 'false' })
    expect(service.enabled()).toBe(false)
    await expect(service.presign('u1', { mimeType: 'video/mp4', sizeBytes: MB })).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('DirectUploadService.complete', () => {
  async function started(mimeType = 'video/mp4', userId = 'u1', env: Record<string, string> = {}) {
    const ctx = setup(env)
    const { key } = await ctx.service.presign(userId, { mimeType, sizeBytes: 5 * MB })
    return { ...ctx, key }
  }

  it('vídeo conferido é movido para a chave definitiva, vai para a fila (com capa) e devolve o formato do envio comum', async () => {
    const { service, storage, processing, rows, key } = await started()
    const out = await service.complete('u1', key)

    expect(out).toEqual({ key, url: `${BASE}/${key}`, mimeType: 'video/mp4', size: 5 * MB })
    expect(storage.headObjectSize).toHaveBeenCalledWith(pendingKeyFor(key))
    expect(storage.moveObject).toHaveBeenCalledWith(pendingKeyFor(key), key, 'video/mp4')
    expect(processing.enqueueVideo).toHaveBeenCalledWith(key, { poster: true })
    expect(rows[0]).toMatchObject({ processing: 'PENDING', sizeBytes: 5 * MB })
  })

  it('PDF conferido não entra na fila de vídeo', async () => {
    const { service, storage, processing, rows, key } = await started('application/pdf')
    storage.sniffObjectMime.mockResolvedValue('application/pdf')
    await service.complete('u1', key)
    expect(processing.enqueueVideo).not.toHaveBeenCalled()
    expect(rows[0].processing).toBe('NONE')
  })

  it('o tamanho real (e não o declarado) é o que fica registrado', async () => {
    const { service, storage, rows, key } = await started()
    storage.headObjectSize.mockResolvedValue(3 * MB)
    await expect(service.complete('u1', key)).resolves.toMatchObject({ size: 3 * MB })
    expect(rows[0].sizeBytes).toBe(3 * MB)
  })

  it('arquivo que não é do tipo declarado é apagado, a reserva some e o envio é recusado', async () => {
    const { service, storage, processing, rows, key } = await started()
    storage.sniffObjectMime.mockResolvedValue('image/png') // era para ser vídeo
    await expect(service.complete('u1', key)).rejects.toThrow('Tipo de arquivo não permitido')
    expect(storage.delete).toHaveBeenCalledWith(pendingKeyFor(key))
    expect(storage.moveObject).not.toHaveBeenCalled()
    expect(processing.enqueueVideo).not.toHaveBeenCalled()
    expect(rows).toHaveLength(0)
  })

  it('conteúdo irreconhecível (nem os primeiros bytes batem) também é recusado', async () => {
    const { service, storage, key } = await started()
    storage.sniffObjectMime.mockResolvedValue('')
    await expect(service.complete('u1', key)).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.moveObject).not.toHaveBeenCalled()
  })

  it('MOV e M4A (mesmo contêiner do MP4) não são confundidos com tipo falso', async () => {
    const { service, storage, key } = await started('video/quicktime')
    storage.sniffObjectMime.mockResolvedValue('video/mp4') // a leitura dos bytes diz mp4 para vários .mov
    await expect(service.complete('u1', key)).resolves.toMatchObject({ mimeType: 'video/quicktime' })
    expect(storage.moveObject).toHaveBeenCalledWith(pendingKeyFor(key), key, 'video/quicktime')
  })

  it('PDF declarado não pode ser vídeo e vídeo declarado não pode ser PDF', async () => {
    const pdf = await started('application/pdf')
    pdf.storage.sniffObjectMime.mockResolvedValue('video/mp4')
    await expect(pdf.service.complete('u1', pdf.key)).rejects.toBeInstanceOf(BadRequestException)
    const video = await started('video/mp4')
    video.storage.sniffObjectMime.mockResolvedValue('application/pdf')
    await expect(video.service.complete('u1', video.key)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('arquivo vazio ou maior que o limite é apagado e recusado', async () => {
    const empty = await started()
    empty.storage.headObjectSize.mockResolvedValue(0)
    await expect(empty.service.complete('u1', empty.key)).rejects.toThrow('vazio')
    expect(empty.storage.delete).toHaveBeenCalledWith(pendingKeyFor(empty.key))

    const big = await started('application/pdf')
    big.storage.headObjectSize.mockResolvedValue(60 * MB)
    await expect(big.service.complete('u1', big.key)).rejects.toThrow('50 MB')
    expect(big.storage.moveObject).not.toHaveBeenCalled()
    expect(big.rows).toHaveLength(0)
  })

  it('se o arquivo nem chegou ao bucket, avisa e mantém a reserva para a pessoa tentar de novo', async () => {
    const { service, storage, rows, key } = await started()
    storage.headObjectSize.mockResolvedValue(null)
    await expect(service.complete('u1', key)).rejects.toThrow('não chegou')
    expect(rows).toHaveLength(1)
    expect(rows[0].processing).toBe('UPLOADING')
  })

  it('o envio de uma pessoa não pode ser confirmado por outra', async () => {
    const { service, storage, key } = await started('video/mp4', 'u1')
    await expect(service.complete('u2', key)).rejects.toBeInstanceOf(NotFoundException)
    expect(storage.headObjectSize).not.toHaveBeenCalled()
    await expect(service.complete('u1', 'reports/00000000-0000-4000-8000-000000000000.mp4')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('confirmar duas vezes devolve o mesmo resultado sem mover nem enfileirar de novo', async () => {
    const { service, storage, processing, key } = await started()
    const first = await service.complete('u1', key)
    const second = await service.complete('u1', key)
    expect(second).toEqual(first)
    expect(storage.moveObject).toHaveBeenCalledTimes(1)
    expect(processing.enqueueVideo).toHaveBeenCalledTimes(1)
  })
})

describe('DirectUploadService.purgeStaleUploads', () => {
  it('apaga só os envios que ficaram sem confirmar há mais de 2 horas', async () => {
    const { service, storage, rows } = setup()
    const at = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000)
    const base = { uploaderId: 'u1', kind: 'VIDEO', mimeType: 'video/mp4', sizeBytes: 1, originalSizeBytes: 1 }
    rows.push(
      { ...base, key: `reports/${UUID}.mp4`, processing: 'UPLOADING', createdAt: at(STALE_UPLOAD_HOURS + 1) },
      { ...base, key: 'reports/novo.mp4', processing: 'UPLOADING', createdAt: at(0.5) },
      { ...base, key: 'reports/pronto.mp4', processing: 'PENDING', createdAt: at(50) },
    )

    await expect(service.purgeStaleUploads()).resolves.toBe(1)
    expect(storage.delete).toHaveBeenCalledTimes(1)
    expect(storage.delete).toHaveBeenCalledWith(`pending/${UUID}.mp4`)
    expect(rows.map((row) => row.key)).toEqual(['reports/novo.mp4', 'reports/pronto.mp4'])
  })

  it('se o bucket falhar, mantém a linha para tentar na próxima hora', async () => {
    const { service, storage, rows } = setup()
    rows.push({
      uploaderId: 'u1', kind: 'VIDEO', mimeType: 'video/mp4', sizeBytes: 1, originalSizeBytes: 1,
      key: `reports/${UUID}.mp4`, processing: 'UPLOADING', createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    })
    storage.delete.mockRejectedValueOnce(new Error('R2 fora do ar'))
    await expect(service.purgeStaleUploads()).resolves.toBe(0)
    expect(rows).toHaveLength(1)
  })
})
