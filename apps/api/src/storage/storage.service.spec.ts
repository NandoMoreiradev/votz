import { BadRequestException } from '@nestjs/common'
import { S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { StorageService } from './storage.service'
import { generateVideoPoster } from './video-poster'

const sendMock = jest.fn().mockResolvedValue({})

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3')
  return {
    ...actual,
    S3Client: jest.fn(() => ({ send: sendMock })),
  }
})

jest.mock('./video-poster', () => ({
  ...jest.requireActual('./video-poster'),
  generateVideoPoster: jest.fn(),
}))

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://r2.signed.url/file'),
}))

describe('StorageService', () => {
  let service: StorageService

  beforeEach(() => {
    sendMock.mockClear()
    ;(getSignedUrl as jest.Mock).mockClear()

    const config: any = {
      getOrThrow: jest.fn((k: string) => {
        const map: Record<string, string> = {
          CLOUDFLARE_R2_BUCKET: 'votz-bucket',
          CLOUDFLARE_R2_ENDPOINT: 'https://r2.example.com',
          CLOUDFLARE_R2_ACCESS_KEY: 'ak',
          CLOUDFLARE_R2_SECRET_KEY: 'sk',
        }
        return map[k]
      }),
      get: jest.fn((k: string, def = '') => (k === 'CLOUDFLARE_R2_PUBLIC_URL' ? 'https://cdn.votz.app/' : def)),
    }

    service = new StorageService(config)
  })

  it('uploads valid PNG buffer detected via magic bytes and strips trailing slash on public URL', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const res = await service.upload(pngHeader, 'image/jpeg', 'avatars')

    expect(S3Client).toHaveBeenCalled()
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(res.mimeType).toBe('image/png')
    expect(res.key).toMatch(/^avatars\/.+\.png$/)
    expect(res.url).toBe(`https://cdn.votz.app/${res.key}`)
  })

  it('rejects unrecognized buffer magic bytes', async () => {
    const junk = Buffer.from('not-a-valid-image-buffer-12345')
    await expect(service.upload(junk, 'image/png', 'reports')).rejects.toThrow(BadRequestException)
  })

  it('generates signed download and upload URLs and rejects invalid upload MIME', async () => {
    const dl = await service.getSignedDownloadUrl('verification/doc.pdf', 1200)
    expect(dl).toBe('https://r2.signed.url/file')

    const ul = await service.getSignedUploadUrl('reports/a.jpg', 'image/jpeg', 300)
    expect(ul).toBe('https://r2.signed.url/file')

    await expect(service.getSignedUploadUrl('reports/x.exe', 'application/x-msdownload')).rejects.toThrow(
      BadRequestException,
    )
  })

  it('deletes object and uploads json', async () => {
    await service.uploadJson('exports/u1.json', { ok: true })
    await service.delete('exports/u1.json')
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  describe('capa do vídeo', () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(32)])
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const poster = generateVideoPoster as jest.Mock
    const sentKeys = () => sendMock.mock.calls.map(([command]) => ({ name: command.constructor.name, key: command.input.Key, type: command.input.ContentType, cache: command.input.CacheControl }))

    beforeEach(() => poster.mockReset())

    it('salva a capa ao lado do vídeo, pública, quando o ffmpeg gera a imagem', async () => {
      poster.mockResolvedValue(jpeg)
      const res = await service.upload(mp4, 'video/mp4', 'reports')

      expect(res.mimeType).toBe('video/mp4')
      const sent = sentKeys()
      expect(sent).toHaveLength(2)
      expect(sent[0]).toMatchObject({ name: 'PutObjectCommand', key: res.key, type: 'video/mp4' })
      expect(sent[1].key).toBe(res.key.replace(/\.mp4$/, '.poster.jpg'))
      expect(sent[1].type).toBe('image/jpeg')
      expect(sent[1].cache).toMatch(/^public/)
      expect(poster).toHaveBeenCalledWith(mp4, 'mp4', expect.any(Object))
    })

    it('se a capa não puder ser gerada, o vídeo é salvo mesmo assim', async () => {
      poster.mockResolvedValue(null)
      const res = await service.upload(mp4, 'video/mp4', 'posts')
      expect(sentKeys()).toHaveLength(1)
      expect(res.key).toMatch(/^posts\/.+\.mp4$/)
    })

    it('se a geração da capa lançar erro, o envio do vídeo não falha', async () => {
      poster.mockRejectedValue(new Error('ffmpeg quebrou'))
      await expect(service.upload(mp4, 'video/mp4', 'reports')).resolves.toMatchObject({ mimeType: 'video/mp4' })
      expect(sentKeys()).toHaveLength(1)
    })

    it('se salvar a capa falhar no storage, o envio do vídeo não falha', async () => {
      poster.mockResolvedValue(jpeg)
      sendMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('R2 fora do ar'))
      await expect(service.upload(mp4, 'video/mp4', 'reports')).resolves.toMatchObject({ mimeType: 'video/mp4' })
    })

    it('imagem não gera capa', async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
      await service.upload(png, 'image/png', 'reports')
      expect(poster).not.toHaveBeenCalled()
      expect(sentKeys()).toHaveLength(1)
    })

    it('apagar o vídeo apaga também a capa', async () => {
      await service.delete('reports/abc.mp4')
      expect(sentKeys().map((s) => [s.name, s.key])).toEqual([
        ['DeleteObjectCommand', 'reports/abc.mp4'],
        ['DeleteObjectCommand', 'reports/abc.poster.jpg'],
      ])
    })

    it('apagar uma foto apaga também a miniatura', async () => {
      await service.delete('reports/abc.jpeg')
      expect(sentKeys().map((s) => [s.name, s.key])).toEqual([
        ['DeleteObjectCommand', 'reports/abc.jpeg'],
        ['DeleteObjectCommand', 'reports/abc.thumb.webp'],
      ])
    })

    it('apagar algo que não é vídeo nem foto apaga só o próprio arquivo', async () => {
      await service.delete('reports/abc.pdf')
      expect(sentKeys()).toHaveLength(1)
    })

    it('falha ao apagar a capa não impede apagar o vídeo', async () => {
      sendMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('sem permissão'))
      await expect(service.delete('reports/abc.mp4')).resolves.toBeUndefined()
    })
  })

  describe('envio direto ao bucket', () => {
    const commands = () => sendMock.mock.calls.map(([command]) => ({ name: command.constructor.name, input: command.input }))

    it('assina o envio com o tamanho (quando informado); o tipo vai no comando mas o bucket não o impõe', async () => {
      await service.getSignedUploadUrl('pending/a.mp4', 'video/mp4', 900, 5_000_000)
      const command = (getSignedUrl as jest.Mock).mock.calls[0][1]
      expect(command.input).toMatchObject({ Key: 'pending/a.mp4', ContentType: 'video/mp4', ContentLength: 5_000_000 })
      expect((getSignedUrl as jest.Mock).mock.calls[0][2]).toEqual({ expiresIn: 900 })

      ;(getSignedUrl as jest.Mock).mockClear()
      await service.getSignedUploadUrl('pending/b.pdf', 'application/pdf')
      expect((getSignedUrl as jest.Mock).mock.calls[0][1].input).not.toHaveProperty('ContentLength')
    })

    it('headObjectSize devolve o tamanho, null quando não existe e repassa outros erros', async () => {
      sendMock.mockResolvedValueOnce({ ContentLength: 1234 })
      await expect(service.headObjectSize('pending/a.mp4')).resolves.toBe(1234)

      sendMock.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }))
      await expect(service.headObjectSize('pending/a.mp4')).resolves.toBeNull()

      sendMock.mockRejectedValueOnce(Object.assign(new Error('sem permissão'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }))
      await expect(service.headObjectSize('pending/a.mp4')).rejects.toThrow('sem permissão')
    })

    it('sniffObjectMime lê só os primeiros bytes e reconhece o tipo real', async () => {
      const pdf = Buffer.from('%PDF-1.7\n%conteudo qualquer', 'latin1')
      sendMock.mockResolvedValueOnce({ Body: { transformToByteArray: async () => new Uint8Array(pdf) } })
      await expect(service.sniffObjectMime('pending/a.pdf')).resolves.toBe('application/pdf')
      expect(commands()[0].input).toMatchObject({ Key: 'pending/a.pdf', Range: 'bytes=0-31' })

      const html = Buffer.from('<html><script>alert(1)</script>')
      sendMock.mockResolvedValueOnce({ Body: { transformToByteArray: async () => new Uint8Array(html) } })
      await expect(service.sniffObjectMime('pending/b.mp4')).resolves.toBe('')

      sendMock.mockResolvedValueOnce({})
      await expect(service.sniffObjectMime('pending/c.mp4')).resolves.toBe('')
    })

    it('moveObject copia com o tipo e o cache definitivos e só então apaga a origem', async () => {
      await service.moveObject('pending/video bom (1).mp4', 'reports/v.mp4', 'video/mp4')
      const [copy, del] = commands()
      expect(copy.name).toBe('CopyObjectCommand')
      expect(copy.input).toMatchObject({
        Bucket: 'votz-bucket',
        Key: 'reports/v.mp4',
        ContentType: 'video/mp4',
        MetadataDirective: 'REPLACE',
      })
      expect(copy.input.CopySource).toBe('votz-bucket/pending/video%20bom%20(1).mp4')
      expect(copy.input.CacheControl).toMatch(/^public/)
      expect(del.name).toBe('DeleteObjectCommand')
      expect(del.input).toMatchObject({ Key: 'pending/video bom (1).mp4' })
    })

    it('se a cópia falhar, a origem NÃO é apagada', async () => {
      sendMock.mockRejectedValueOnce(new Error('R2 fora do ar'))
      await expect(service.moveObject('pending/a.mp4', 'reports/a.mp4', 'video/mp4')).rejects.toThrow('R2 fora do ar')
      expect(commands().map((c) => c.name)).toEqual(['CopyObjectCommand'])
    })
  })

  describe('foto de relato: reduzida, sem metadados e com miniatura', () => {
    const sentKeys = () => sendMock.mock.calls.map(([command]) => ({ name: command.constructor.name, key: command.input.Key, type: command.input.ContentType, cache: command.input.CacheControl, body: command.input.Body as Buffer }))
    const bigJpeg = () =>
      sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 90, g: 120, b: 150 } } })
        .jpeg({ quality: 95 })
        .withExif({ IFD0: { Copyright: 'dados-da-camera' } })
        .toBuffer()

    it('guarda a foto reduzida e a miniatura ao lado, e devolve as medidas', async () => {
      const original = await bigJpeg()
      const res = await service.upload(original, 'image/jpeg', 'reports')

      expect(res.mimeType).toBe('image/jpeg')
      expect(res.key).toMatch(/^reports\/.+\.jpeg$/)
      expect(res.width).toBe(2048)
      expect(res.height).toBe(1536)
      expect(res.originalSize).toBe(original.byteLength)
      expect(res.size).toBeLessThan(original.byteLength)
      expect(res.thumbUrl).toBe(`https://cdn.votz.app/${res.key.replace(/\.jpeg$/, '.thumb.webp')}`)

      const sent = sentKeys()
      expect(sent).toHaveLength(2)
      expect(sent[0]).toMatchObject({ key: res.key, type: 'image/jpeg' })
      expect(sent[0].body.includes(Buffer.from('dados-da-camera'))).toBe(false)
      expect(sent[0].body.byteLength).toBe(res.size)
      expect(sent[1]).toMatchObject({ key: res.key.replace(/\.jpeg$/, '.thumb.webp'), type: 'image/webp' })
      expect(sent[1].cache).toMatch(/^public/)
    })

    it('fotos de publicação também são otimizadas', async () => {
      const res = await service.upload(await bigJpeg(), 'image/jpeg', 'posts')
      expect(res.width).toBe(2048)
      expect(res.thumbUrl).toBeDefined()
    })

    it('avatar não passa pela otimização de foto de relato', async () => {
      const original = await bigJpeg()
      const res = await service.upload(original, 'image/jpeg', 'avatars')
      expect(res.size).toBe(original.byteLength)
      expect(res.thumbUrl).toBeUndefined()
      expect(sentKeys()).toHaveLength(1)
    })

    it('GIF fica como veio e não ganha miniatura', async () => {
      const gif = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#f00' } }).gif().toBuffer()
      const res = await service.upload(gif, 'image/gif', 'reports')
      expect(res.mimeType).toBe('image/gif')
      expect(res.size).toBe(gif.byteLength)
      expect(res.thumbUrl).toBeUndefined()
      expect(sentKeys()).toHaveLength(1)
    })

    it('se salvar a miniatura falhar, a foto já está salva e o envio segue', async () => {
      sendMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('R2 fora do ar'))
      const res = await service.upload(await bigJpeg(), 'image/jpeg', 'reports')
      expect(res.key).toMatch(/^reports\/.+\.jpeg$/)
      expect(res.thumbUrl).toBeUndefined()
    })
  })

  describe('isOwnStorageUrl & ALLOWED_EXTERNAL_IMAGE_HOSTS (A4)', () => {
    it('accepts URL from publicBase in expected folder and rejects wrong folder or external hosts', () => {
      expect(service.isOwnStorageUrl('https://cdn.votz.app/reports/img-1.png', 'reports')).toBe(true)
      expect(service.isOwnStorageUrl('https://cdn.votz.app/avatars/u-1.png', 'avatars')).toBe(true)
      expect(service.isOwnStorageUrl('https://cdn.votz.app/entities/e-1.png', 'entities')).toBe(true)

      // Wrong folder
      expect(service.isOwnStorageUrl('https://cdn.votz.app/avatars/u-1.png', 'reports')).toBe(false)
      expect(service.isOwnStorageUrl('https://cdn.votz.app/reports/img-1.png', 'entities')).toBe(false)
      // Path traversal / query / foreign origin / ftp
      expect(service.isOwnStorageUrl('https://cdn.votz.app/reports/../verification/doc.pdf', 'reports')).toBe(false)
      expect(service.isOwnStorageUrl('https://evil.example/reports/img-1.png', 'reports')).toBe(false)
      expect(service.isOwnStorageUrl('ftp://cdn.votz.app/reports/img-1.png', 'reports')).toBe(false)

      expect(() => service.assertOwnStorageUrl('https://evil.example/a.jpg', 'reports')).toThrow(
        'Envie o arquivo pelo Votz',
      )
    })

    it('allows official politician image hosts via default and custom ALLOWED_EXTERNAL_IMAGE_HOSTS', () => {
      expect(service.isAllowedExternalImageUrl('https://www.camara.leg.br/foto/1.jpg')).toBe(true)
      expect(service.isAllowedExternalImageUrl('https://www.senado.leg.br/senadores/1.jpg')).toBe(true)
      expect(service.isAllowedExternalImageUrl('https://evil.example/1.jpg')).toBe(false)

      expect(() =>
        service.assertOwnStorageUrl('https://www.camara.leg.br/foto/1.jpg', 'avatars', {
          allowExternalImageHosts: true,
        }),
      ).not.toThrow()

      const customConfig: any = {
        getOrThrow: jest.fn((k: string) =>
          k === 'CLOUDFLARE_R2_BUCKET' ? 'votz' : 'https://r2.example.com',
        ),
        get: jest.fn((k: string, def = '') => {
          if (k === 'CLOUDFLARE_R2_PUBLIC_URL') return 'https://cdn.votz.app'
          if (k === 'ALLOWED_EXTERNAL_IMAGE_HOSTS') return 'fotos.tse.jus.br'
          return def
        }),
      }
      const customStorage = new StorageService(customConfig)
      expect(customStorage.isAllowedExternalImageUrl('https://fotos.tse.jus.br/cand.jpg')).toBe(true)
      expect(customStorage.isAllowedExternalImageUrl('https://www.camara.leg.br/foto/1.jpg')).toBe(false)
    })
  })
})
