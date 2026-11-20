import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { REPORT_MEDIA_ORPHAN_DAYS, ReportMediaService, VIDEO_STUCK_MINUTES, reportMediaKind } from './report-media.service'

const BASE = 'https://cdn.votz.app'
const DAY = 24 * 60 * 60 * 1000

function setup() {
  const rows: Array<{
    id: string
    key: string
    attachedAt: Date | null
    createdAt: Date
    uploaderId?: string
    processing?: string
  }> = []
  const prisma = {
    reportMedia: {
      create: jest.fn(async ({ data }) => {
        const row = { id: `m${rows.length + 1}`, attachedAt: null, createdAt: new Date(), ...data }
        rows.push(row)
        return row
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const hit = rows.filter(
          (row) =>
            where.key.in.includes(row.key) &&
            row.attachedAt === null &&
            (!where.processing || row.processing !== where.processing.not),
        )
        hit.forEach((row) => Object.assign(row, data))
        return { count: hit.length }
      }),
      findMany: jest.fn(async ({ where, take }) =>
        where.key
          ? rows.filter((row) => where.key.in.includes(row.key))
          : rows
              .filter((row) => row.attachedAt === null && row.createdAt < where.createdAt.lt)
              .slice(0, take),
      ),
      delete: jest.fn(async ({ where }) => {
        rows.splice(rows.findIndex((row) => row.id === where.id), 1)
      }),
    },
  }
  const storage = {
    extractKeyFromUrl: jest.fn((url: string) => (url.startsWith(`${BASE}/`) ? url.slice(BASE.length + 1) : null)),
    delete: jest.fn().mockResolvedValue(undefined),
  }
  const service = new ReportMediaService(prisma as never, storage as never)
  return { service, prisma, storage, rows }
}

describe('ReportMediaService', () => {
  it('anota o envio com o tamanho antes e depois de a foto ser reduzida', async () => {
    const { service, prisma } = setup()
    await service.register(
      {
        key: 'reports/a.jpeg',
        url: `${BASE}/reports/a.jpeg`,
        mimeType: 'image/jpeg',
        size: 400_000,
        originalSize: 4_000_000,
        width: 2048,
        height: 1536,
        thumbUrl: `${BASE}/reports/a.thumb.webp`,
      },
      'u1',
    )
    expect(prisma.reportMedia.create).toHaveBeenCalledWith({
      data: {
        key: 'reports/a.jpeg',
        uploaderId: 'u1',
        kind: 'IMAGE',
        mimeType: 'image/jpeg',
        sizeBytes: 400_000,
        originalSizeBytes: 4_000_000,
        width: 2048,
        height: 1536,
        hasThumb: true,
        processing: 'NONE',
      },
    })
  })

  it('vídeo e PDF não têm medidas nem miniatura, e o tamanho original é o próprio', async () => {
    const { service, prisma } = setup()
    await service.register({ key: 'reports/v.mp4', url: '', mimeType: 'video/mp4', size: 9 }, 'u1')
    expect(prisma.reportMedia.create.mock.calls[0][0].data).toMatchObject({
      kind: 'VIDEO',
      originalSizeBytes: 9,
      width: null,
      height: null,
      hasThumb: false,
    })
    expect(reportMediaKind('application/pdf')).toBe('PDF')
    expect(reportMediaKind('audio/webm')).toBe('AUDIO')
  })

  it('se não conseguir anotar, o envio não falha', async () => {
    const { service, prisma } = setup()
    prisma.reportMedia.create.mockRejectedValueOnce(new Error('banco fora do ar'))
    await expect(
      service.register({ key: 'reports/a.jpeg', url: '', mimeType: 'image/jpeg', size: 1 }, 'u1'),
    ).resolves.toBeUndefined()
  })

  it('marca como usados só os arquivos do Votz que ainda não tinham sido anexados', async () => {
    const { service, prisma, rows } = setup()
    for (const key of ['reports/a.jpeg', 'reports/b.jpeg']) {
      await service.register({ key, url: '', mimeType: 'image/jpeg', size: 1 }, 'u1')
    }
    await service.attach([`${BASE}/reports/a.jpeg`, 'https://outro.site/x.jpg'], 'u1')

    expect(rows.find((row) => row.key === 'reports/a.jpeg')!.attachedAt).not.toBeNull()
    expect(rows.find((row) => row.key === 'reports/b.jpeg')!.attachedAt).toBeNull()
    expect(prisma.reportMedia.updateMany.mock.calls[0][0].where.key.in).toEqual(['reports/a.jpeg'])

    // Sem URLs do Votz não consulta o banco.
    prisma.reportMedia.updateMany.mockClear()
    prisma.reportMedia.findMany.mockClear()
    await service.attach(undefined, 'u1')
    await service.attach([], 'u1')
    await service.attach(['https://outro.site/x.jpg'], 'u1')
    expect(prisma.reportMedia.findMany).not.toHaveBeenCalled()
    expect(prisma.reportMedia.updateMany).not.toHaveBeenCalled()
  })

  it('apaga só o que ninguém anexou depois do prazo e guarda o resto', async () => {
    const { service, storage, rows } = setup()
    const at = (days: number) => new Date(Date.now() - days * DAY)
    rows.push(
      { id: 'velho-sem-uso', key: 'reports/velho.jpeg', attachedAt: null, createdAt: at(REPORT_MEDIA_ORPHAN_DAYS + 1) },
      { id: 'velho-usado', key: 'reports/usado.jpeg', attachedAt: at(10), createdAt: at(REPORT_MEDIA_ORPHAN_DAYS + 3) },
      { id: 'novo-sem-uso', key: 'reports/novo.jpeg', attachedAt: null, createdAt: at(1) },
    )

    await expect(service.purgeOrphans()).resolves.toBe(1)
    expect(storage.delete).toHaveBeenCalledTimes(1)
    expect(storage.delete).toHaveBeenCalledWith('reports/velho.jpeg')
    expect(rows.map((row) => row.id)).toEqual(['velho-usado', 'novo-sem-uso'])
  })

  it('se o bucket falhar ao apagar, mantém a linha para tentar de novo no dia seguinte', async () => {
    const { service, storage, rows } = setup()
    rows.push({ id: 'a', key: 'reports/a.jpeg', attachedAt: null, createdAt: new Date(Date.now() - 9 * DAY) })
    rows.push({ id: 'b', key: 'reports/b.jpeg', attachedAt: null, createdAt: new Date(Date.now() - 9 * DAY) })
    storage.delete.mockRejectedValueOnce(new Error('R2 fora do ar'))

    await expect(service.purgeOrphans()).resolves.toBe(1)
    expect(rows.map((row) => row.id)).toEqual(['a'])
  })
})

describe('ReportMediaService: vídeo na fila de conversão', () => {
  it('vídeo é registrado como PENDING e o resto como NONE', async () => {
    const { service, prisma } = setup()
    await service.register({ key: 'reports/v.mp4', url: '', mimeType: 'video/mp4', size: 9 }, 'u1')
    await service.register({ key: 'reports/a.jpeg', url: '', mimeType: 'image/jpeg', size: 9 }, 'u1')
    await service.register({ key: 'reports/d.pdf', url: '', mimeType: 'application/pdf', size: 9 }, 'u1')
    expect(prisma.reportMedia.create.mock.calls.map(([arg]) => arg.data.processing)).toEqual(['PENDING', 'NONE', 'NONE'])
  })

  it('recoloca na fila só o vídeo que ficou parado há mais de uma hora', async () => {
    const { prisma, storage } = setup()
    const processing = { enqueueVideo: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) }
    const service = new ReportMediaService(prisma as never, storage as never, processing as never)
    ;(prisma.reportMedia as Record<string, unknown>).findMany = jest.fn().mockResolvedValue([{ key: 'reports/a.mp4' }, { key: 'reports/b.mov' }])

    await expect(service.requeueStuckVideos()).resolves.toBe(1)
    expect(processing.enqueueVideo.mock.calls).toEqual([['reports/a.mp4'], ['reports/b.mov']])
    const where = ((prisma.reportMedia as { findMany: jest.Mock }).findMany.mock.calls[0][0] as { where: { createdAt: { lt: Date }; kind: string; processing: string } }).where
    expect(where).toMatchObject({ kind: 'VIDEO', processing: 'PENDING' })
    expect(Date.now() - where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(VIDEO_STUCK_MINUTES * 60 * 1000 - 1000)
  })

  it('sem a fila configurada não faz nada', async () => {
    const { service } = setup()
    await expect(service.requeueStuckVideos()).resolves.toBe(0)
  })
})

describe('ReportMediaService.attach: conferência de dono', () => {
  const upload = (service: ReportMediaService, key: string, userId: string, mimeType = 'image/jpeg') =>
    service.register({ key, url: '', mimeType, size: 1 }, userId)

  it('quem enviou pode anexar, inclusive o mesmo arquivo de novo', async () => {
    const { service, rows } = setup()
    await upload(service, 'reports/a.jpeg', 'u1')
    await expect(service.attach([`${BASE}/reports/a.jpeg`], 'u1')).resolves.toBeUndefined()
    expect(rows[0].attachedAt).not.toBeNull()
    await expect(service.attach([`${BASE}/reports/a.jpeg`], 'u1')).resolves.toBeUndefined()
  })

  it('arquivo de OUTRA pessoa é recusado (403), mesmo já publicado em outro relato', async () => {
    const { service, prisma, rows } = setup()
    await upload(service, 'reports/da-maria.jpeg', 'maria')
    await service.attach([`${BASE}/reports/da-maria.jpeg`], 'maria') // Maria já usou no relato dela

    const refused = await service.attach([`${BASE}/reports/da-maria.jpeg`], 'joao').catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(ForbiddenException)
    expect((refused as Error).message).toContain('você mesmo enviou')
    // Nada mudou para a Maria.
    expect(rows[0].uploaderId).toBe('maria')
    expect(prisma.reportMedia.updateMany).toHaveBeenCalledTimes(1)
  })

  it('um arquivo alheio no meio da lista derruba o pedido inteiro e não marca NENHUM', async () => {
    const { service, prisma, rows } = setup()
    await upload(service, 'reports/meu.jpeg', 'joao')
    await upload(service, 'reports/dela.jpeg', 'maria')

    await expect(
      service.attach([`${BASE}/reports/meu.jpeg`, `${BASE}/reports/dela.jpeg`], 'joao'),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.reportMedia.updateMany).not.toHaveBeenCalled()
    expect(rows.find((row) => row.key === 'reports/meu.jpeg')!.attachedAt).toBeNull()
  })

  it('envio direto ainda não confirmado (UPLOADING) não pode ser anexado', async () => {
    const { service, prisma, rows } = setup()
    rows.push({ id: 'x', key: 'reports/pendente.mp4', uploaderId: 'u1', processing: 'UPLOADING', attachedAt: null, createdAt: new Date() })
    await expect(service.attach([`${BASE}/reports/pendente.mp4`], 'u1')).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.reportMedia.updateMany).not.toHaveBeenCalled()
  })

  it('arquivo de antes da tabela (sem linha) continua valendo e não é marcado', async () => {
    const { service, prisma } = setup()
    await expect(service.attach([`${BASE}/reports/antigo.jpeg`], 'u1')).resolves.toBeUndefined()
    expect(prisma.reportMedia.updateMany.mock.calls[0][0].where.key.in).toEqual(['reports/antigo.jpeg'])
  })

  it('misturar arquivo seu com arquivo antigo funciona; repetir a mesma URL não duplica a consulta', async () => {
    const { service, prisma, rows } = setup()
    await upload(service, 'reports/meu.jpeg', 'u1')
    await service.attach([`${BASE}/reports/meu.jpeg`, `${BASE}/reports/antigo.jpeg`, `${BASE}/reports/meu.jpeg`], 'u1')
    expect(prisma.reportMedia.findMany.mock.calls[0][0].where.key.in).toEqual(['reports/meu.jpeg', 'reports/antigo.jpeg'])
    expect(rows[0].attachedAt).not.toBeNull()
  })

  it('se o banco falhar na conferência, NÃO anexa (sem conferir, não libera)', async () => {
    const { service, prisma } = setup()
    prisma.reportMedia.findMany.mockRejectedValueOnce(new Error('banco fora do ar'))
    await expect(service.attach([`${BASE}/reports/a.jpeg`], 'u1')).rejects.toThrow('banco fora do ar')
    expect(prisma.reportMedia.updateMany).not.toHaveBeenCalled()
  })

  it('se só a marcação falhar depois de conferir, o anexo segue (a marcação é só da limpeza)', async () => {
    const { service, prisma } = setup()
    await upload(service, 'reports/a.jpeg', 'u1')
    prisma.reportMedia.updateMany.mockRejectedValueOnce(new Error('banco lento'))
    await expect(service.attach([`${BASE}/reports/a.jpeg`], 'u1')).resolves.toBeUndefined()
  })
})
