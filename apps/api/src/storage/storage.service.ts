import { Injectable, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
])

const IMAGE_MAX_SIZE = 10 * 1024 * 1024   // 10 MB
const VIDEO_MAX_SIZE = 100 * 1024 * 1024  // 100 MB

function detectMimeFromBuffer(buf: Buffer): string {
  if (buf.length < 12) return ''
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png'
  // GIF: 47 49 46 38 (GIF8)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif'
  // WebP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  // PDF: %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf'
  // MP4 / MOV: ftyp box at offset 4
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii').trim()
    const mp4Brands = ['isom', 'iso2', 'avc1', 'mp41', 'mp42', 'M4V ', 'M4A ', 'f4v ']
    if (mp4Brands.includes(brand)) return 'video/mp4'
    if (brand === 'qt  ') return 'video/quicktime'
    // treat unknown ftyp brands as mp4 (e.g. HEVC recorded on iPhone)
    return 'video/mp4'
  }
  return ''
}

export interface UploadedFile {
  key: string
  url: string
  mimeType: string
  size: number
}

@Injectable()
export class StorageService {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly endpoint: string
  private readonly publicBase: string

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('CLOUDFLARE_R2_BUCKET')
    this.endpoint = this.config.getOrThrow<string>('CLOUDFLARE_R2_ENDPOINT')

    // CLOUDFLARE_R2_PUBLIC_URL → URL pública do bucket (ex: https://pub-XXX.r2.dev)
    // Se não configurada, usa o endpoint S3 + bucket como fallback (não acessível publicamente)
    const pub = this.config.get<string>('CLOUDFLARE_R2_PUBLIC_URL', '')
    this.publicBase = pub ? pub.replace(/\/$/, '') : `${this.endpoint}/${this.bucket}`

    this.client = new S3Client({
      region: 'auto',
      endpoint: this.endpoint,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('CLOUDFLARE_R2_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('CLOUDFLARE_R2_SECRET_KEY'),
      },
    })
  }

  async upload(
    buffer: Buffer,
    _claimedMimeType: string,
    folder: 'reports' | 'avatars' | 'entities' | 'verification',
  ): Promise<UploadedFile> {
    const mimeType = detectMimeFromBuffer(buffer)

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('Tipo de arquivo não permitido ou não reconhecido')
    }

    const isVideo = mimeType.startsWith('video/')
    const maxSize = isVideo ? VIDEO_MAX_SIZE : IMAGE_MAX_SIZE
    if (buffer.byteLength > maxSize) {
      throw new BadRequestException(
        isVideo ? 'Vídeo excede o limite de 100 MB' : 'Imagem excede o limite de 10 MB',
      )
    }

    const ext = mimeType.split('/')[1].replace('quicktime', 'mov')
    const key = `${folder}/${randomUUID()}.${ext}`
    const isPrivate = folder === 'verification'

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: isPrivate ? 'private, no-cache' : 'public, max-age=31536000, immutable',
      }),
    )

    return {
      key,
      url: `${this.publicBase}/${key}`,
      mimeType,
      size: buffer.byteLength,
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    )
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    )
  }

  async getSignedUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Tipo de arquivo não permitido: ${mimeType}`)
    }

    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
      }),
      { expiresIn: expiresInSeconds },
    )
  }
}
