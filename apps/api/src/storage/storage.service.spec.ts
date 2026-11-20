import { BadRequestException } from '@nestjs/common'
import { S3Client } from '@aws-sdk/client-s3'
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

    it('apagar algo que não é vídeo apaga só o próprio arquivo', async () => {
      await service.delete('reports/abc.jpeg')
      expect(sentKeys()).toHaveLength(1)
    })

    it('falha ao apagar a capa não impede apagar o vídeo', async () => {
      sendMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('sem permissão'))
      await expect(service.delete('reports/abc.mp4')).resolves.toBeUndefined()
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
