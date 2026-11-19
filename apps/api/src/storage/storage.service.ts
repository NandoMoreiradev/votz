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
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
])

const ALLOWED_COMMENT_MEDIA_EXTENSIONS = Array.from(
  new Set(
    Array.from(ALLOWED_MIME_TYPES)
      .filter((mime) => mime.startsWith('audio/') || mime.startsWith('video/'))
      .map((mime) => mime.split('/')[1].replace('quicktime', 'mov')),
  ),
)

export const COMMENT_MEDIA_KEY_REGEX = new RegExp(
  `^comments\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${ALLOWED_COMMENT_MEDIA_EXTENSIONS.join('|')})$`,
  'i',
)

const ALLOWED_POST_COMMENT_MEDIA_EXTENSIONS = Array.from(
  new Set(
    Array.from(ALLOWED_MIME_TYPES)
      .filter((mime) => mime.startsWith('image/') || mime.startsWith('audio/'))
      .map((mime) => mime.split('/')[1].replace('quicktime', 'mov')),
  ),
)

export const POST_MEDIA_KEY_REGEX =
  /^posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpeg|png|webp|gif|mp4|mov)$/i

export const POST_COMMENT_MEDIA_KEY_REGEX = new RegExp(
  `^post-comments\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${ALLOWED_POST_COMMENT_MEDIA_EXTENSIONS.join('|')})$`,
  'i',
)

export function isCommentMediaKey(key: unknown): key is string {
  return typeof key === 'string' && COMMENT_MEDIA_KEY_REGEX.test(key)
}

export function isPostCommentMediaKey(key: unknown): key is string {
  return typeof key === 'string' && POST_COMMENT_MEDIA_KEY_REGEX.test(key)
}

const IMAGE_MAX_SIZE = 10 * 1024 * 1024   // 10 MB
const VIDEO_MAX_SIZE = 100 * 1024 * 1024  // 100 MB
const PDF_MAX_SIZE   = 50 * 1024 * 1024   // 50 MB
const AUDIO_MAX_SIZE = 50 * 1024 * 1024   // 50 MB

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
  // WebM (áudio ou vídeo): EBML header 1A 45 DF A3
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'audio/webm'
  // OGG: 4F 67 67 53
  if (buf[0] === 0x4F && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'audio/ogg'
  // WAV: RIFF....WAVE
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45) return 'audio/wav'
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

const DEFAULT_EXTERNAL_IMAGE_HOSTS =
  'www.camara.leg.br,camara.leg.br,www.senado.leg.br'

function parseHttpUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed
  } catch {
    return null
  }
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
  private readonly allowedExternalImageHosts: Set<string>

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('CLOUDFLARE_R2_BUCKET')
    this.endpoint = this.config.getOrThrow<string>('CLOUDFLARE_R2_ENDPOINT')

    // CLOUDFLARE_R2_PUBLIC_URL → URL pública do bucket (ex: https://pub-XXX.r2.dev)
    // Se não configurada, usa o endpoint S3 + bucket como fallback (não acessível publicamente)
    const pub = this.config.get<string>('CLOUDFLARE_R2_PUBLIC_URL', '')
    this.publicBase = pub ? pub.replace(/\/$/, '') : `${this.endpoint}/${this.bucket}`

    const rawHosts = this.config.get<string>('ALLOWED_EXTERNAL_IMAGE_HOSTS')
    const hostsSource =
      rawHosts && rawHosts.trim().length > 0 ? rawHosts : DEFAULT_EXTERNAL_IMAGE_HOSTS
    this.allowedExternalImageHosts = new Set(
      hostsSource
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    )

    const forcePathStyle =
      this.endpoint.startsWith('http://') ||
      this.config.get<string>('S3_FORCE_PATH_STYLE') === 'true'

    this.client = new S3Client({
      region: 'auto',
      endpoint: this.endpoint,
      forcePathStyle,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('CLOUDFLARE_R2_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('CLOUDFLARE_R2_SECRET_KEY'),
      },
    })
  }

  async uploadJson(key: string, data: unknown): Promise<void> {
    const body = Buffer.from(JSON.stringify(data, null, 2), 'utf-8')
    await this.uploadBuffer(key, body, 'application/json', true)
  }

  async uploadBuffer(
    key: string,
    body: Buffer,
    contentType: string,
    isPrivate = true,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: isPrivate ? 'private, no-cache' : 'public, max-age=86400',
      }),
    )
  }

  async getObjectBuffer(key: string): Promise<Buffer | null> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    const body = res.Body as
      | { transformToByteArray?: () => Promise<Uint8Array>; [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array> }
      | undefined
    if (!body) return null
    if (typeof body.transformToByteArray === 'function') {
      const bytes = await body.transformToByteArray()
      return Buffer.from(bytes)
    }
    const chunks: Buffer[] = []
    if (typeof body[Symbol.asyncIterator] === 'function') {
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk))
      }
    }
    return chunks.length > 0 ? Buffer.concat(chunks) : null
  }

  async upload(
    buffer: Buffer,
    _claimedMimeType: string,
    folder: 'reports' | 'avatars' | 'entities' | 'verification' | 'comments' | 'posts' | 'post-comments',
  ): Promise<UploadedFile> {
    const mimeType = detectMimeFromBuffer(buffer)

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('Tipo de arquivo não permitido ou não reconhecido')
    }

    const isVideo = mimeType.startsWith('video/')
    const isAudio = mimeType.startsWith('audio/')
    const isPdf = mimeType === 'application/pdf'
    const maxSize = isVideo ? VIDEO_MAX_SIZE : isAudio ? AUDIO_MAX_SIZE : isPdf ? PDF_MAX_SIZE : IMAGE_MAX_SIZE
    if (buffer.byteLength > maxSize) {
      const label = isVideo ? 'Vídeo excede o limite de 100 MB'
        : isAudio ? 'Áudio excede o limite de 50 MB'
        : isPdf ? 'PDF excede o limite de 50 MB'
        : 'Imagem excede o limite de 10 MB'
      throw new BadRequestException(label)
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

  isCommentMediaKey(key: unknown): key is string {
    return isCommentMediaKey(key)
  }

  isPostCommentMediaKey(key: unknown): key is string {
    return isPostCommentMediaKey(key)
  }

  getPublicUrl(key: string): string {
    return `${this.publicBase}/${key}`
  }

  isOwnStorageUrl(url: string, folder?: string): boolean {
    const parsed = parseHttpUrl(url)
    if (!parsed) return false
    if (!url.startsWith(`${this.publicBase}/`)) return false

    const key = this.extractKeyFromUrl(url)
    if (!key) return false
    if (key.includes('..') || key.includes('\\') || key.includes('?') || key.includes('#')) {
      return false
    }

    if (folder) {
      return key.startsWith(`${folder}/`) && key.length > folder.length + 1
    }
    return true
  }

  isAllowedExternalImageUrl(url: string): boolean {
    const parsed = parseHttpUrl(url)
    if (!parsed) return false
    return this.allowedExternalImageHosts.has(parsed.hostname.toLowerCase())
  }

  assertOwnStorageUrl(
    url: string,
    folder?: string,
    options?: { allowExternalImageHosts?: boolean },
  ): void {
    if (this.isOwnStorageUrl(url, folder)) return
    if (options?.allowExternalImageHosts && this.isAllowedExternalImageUrl(url)) return
    throw new BadRequestException('Envie o arquivo pelo Votz')
  }

  assertOwnStorageUrls(urls: string[] | undefined, folder?: string): void {
    for (const url of urls ?? []) {
      this.assertOwnStorageUrl(url, folder)
    }
  }

  extractKeyFromUrl(url: string | null | undefined): string | null {
    if (!url) return null
    const prefixes = [`${this.publicBase}/`, `${this.endpoint}/${this.bucket}/`]
    for (const prefix of prefixes) {
      if (url.startsWith(prefix)) {
        return url.slice(prefix.length)
      }
    }
    return null
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    )
  }

  /** Armazena bytes já cifrados de ponta a ponta (nunca inspeciona MIME nem gera URL pública). */
  async uploadEncryptedBlob(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: 'application/octet-stream',
      }),
    )
  }

  /** Baixa bytes cifrados do bucket privado para streaming autenticado pelo gateway. */
  async downloadEncryptedBlob(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    if (!response.Body) throw new BadRequestException('Arquivo indisponível.')
    const bytes = await response.Body.transformToByteArray()
    return Buffer.from(bytes)
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
