import { BadRequestException } from '@nestjs/common'
import { S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { StorageService } from './storage.service'

const sendMock = jest.fn().mockResolvedValue({})

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3')
  return {
    ...actual,
    S3Client: jest.fn(() => ({ send: sendMock })),
  }
})

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
