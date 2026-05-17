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
    mimeType: string,
    folder: 'reports' | 'avatars' | 'entities',
  ): Promise<UploadedFile> {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Tipo de arquivo não permitido: ${mimeType}`)
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

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
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
